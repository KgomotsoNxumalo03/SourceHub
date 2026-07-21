import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serviceAccountPath = process.env.SOURCEHUB_FIREBASE_SERVICE_ACCOUNT_PATH ?? join(process.cwd(), "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
const db = getFirestore(app);

export const runScheduledSlaChecks = onSchedule("every 5 minutes", async () => {
  const snapshot = await db.collection("tickets").where("status", "in", ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"]).get();
  logger.info("Scheduled SLA sweep", { count: snapshot.size });
});

export const runScheduledEmailPolling = onSchedule("every 5 minutes", async () => {
  const snapshot = await db.collection("emailMessages").where("processingStatus", "in", ["PENDING", "FAILED"]).get();
  logger.info("Scheduled email poll", { count: snapshot.size });
});

export const runScheduledEscalations = onSchedule("every 5 minutes", async () => {
  const snapshot = await db.collection("escalationExecutions").where("status", "==", "PENDING").get();
  logger.info("Scheduled escalation sweep", { count: snapshot.size });
});

function asDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") return value.toDate() as Date;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export const runScheduledNetworkMonitoring = onSchedule("every 15 minutes", async () => {
  const now = new Date();
  const endpoints = await db.collection("endpoints").where("monitoringState", "==", "ACTIVE").get();
  let offlineCount = 0;
  for (const endpointDocument of endpoints.docs) {
    const endpoint = endpointDocument.data();
    const lastCheckIn = asDate(endpoint.lastCheckIn);
    const thresholdMinutes = Number(endpoint.offlineThresholdMinutes ?? 2880);
    if (lastCheckIn && now.getTime() - lastCheckIn.getTime() <= thresholdMinutes * 60_000) continue;
    offlineCount += 1;
    const alertReference = db.collection("networkAlerts").doc(`${endpointDocument.id}:ENDPOINT_OFFLINE`);
    await db.runTransaction(async (transaction) => {
      const currentDocument = await transaction.get(alertReference);
      const current = currentDocument.data();
      const isOpen = current && !["RESOLVED", "CLOSED"].includes(String(current.status));
      transaction.set(alertReference, {
        id: alertReference.id,
        workspaceId: endpoint.workspaceId,
        clientId: endpoint.clientId,
        siteId: endpoint.siteId,
        assetId: endpoint.assetId ?? null,
        endpointId: endpointDocument.id,
        networkEnvironmentId: endpoint.networkEnvironmentId ?? null,
        type: "ENDPOINT_OFFLINE",
        severity: "HIGH",
        status: isOpen ? current?.status : "NEW",
        description: "The endpoint has not checked in within its configured offline threshold.",
        detectedAt: isOpen ? current?.detectedAt : FieldValue.serverTimestamp(),
        lastDetectedAt: FieldValue.serverTimestamp(),
        occurrenceCount: isOpen ? FieldValue.increment(1) : 1,
        assignedTechnicianId: endpoint.responsibleTechnicianId ?? null,
        relatedTicketId: isOpen ? current?.relatedTicketId ?? null : null,
        suppressionState: false,
        suppressionReason: null,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: isOpen ? current?.createdAt : FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await endpointDocument.ref.update({ checkInState: "OFFLINE", updatedAt: FieldValue.serverTimestamp() });
  }
  logger.info("Scheduled network monitoring sweep", { managedEndpoints: endpoints.size, offlineCount });
});

export const runScheduledNetworkRetention = onSchedule("every day 03:15", async () => {
  const retentionDays = Math.max(7, Number(process.env.NETWORK_AUDIT_RETENTION_DAYS ?? 90));
  const ingestionRetentionDays = Math.max(1, Number(process.env.NETWORK_INGESTION_LOG_RETENTION_DAYS ?? 30));
  const now = Date.now();
  const protectedAuditIds = new Set<string>();
  const linkedAlerts = await db.collection("networkAlerts").get();
  for (const alert of linkedAlerts.docs) {
    const data = alert.data();
    if (data.relatedTicketId && data.sourceAuditId) protectedAuditIds.add(String(data.sourceAuditId));
  }
  const targets = [
    ["endpointAudits", retentionDays, (data: Record<string, any>) => !protectedAuditIds.has(String(data.id ?? data.auditId ?? "")) && !data.relatedTicketId],
    ["auditIngestionLogs", ingestionRetentionDays, (_data: Record<string, any>) => true],
    ["endpointChanges", retentionDays, (data: Record<string, any>) => !data.relatedTicketId],
  ] as const;
  let deleted = 0;
  for (const [collectionName, days, canDelete] of targets) {
    const snapshot = await db.collection(collectionName).get();
    let batch = db.batch();
    let batchSize = 0;
    for (const document of snapshot.docs) {
      const data = document.data();
      const createdAt = asDate(data.createdAt ?? data.detectedAt ?? data.auditTimestamp);
      if (!createdAt || now - createdAt.getTime() < days * 86_400_000 || !canDelete(data)) continue;
      batch.delete(document.ref);
      batchSize += 1;
      deleted += 1;
      if (batchSize >= 400) {
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
      }
    }
    if (batchSize > 0) await batch.commit();
  }
  await db.collection("networkRetentionRuns").add({
    retentionDays,
    ingestionRetentionDays,
    deleted,
    completedAt: FieldValue.serverTimestamp(),
    status: "SUCCESS",
  });
  logger.info("Scheduled network retention cleanup", { deleted, retentionDays, ingestionRetentionDays });
});

export const runScheduledFinanceChecks = onSchedule("every day 06:30", async () => {
  const now = new Date();
  const invoices = await db.collection("invoices")
    .where("status", "in", ["SENT", "VIEWED", "PARTIALLY_PAID"])
    .where("dueDate", "<=", now)
    .get();
  let markedOverdue = 0;
  for (const document of invoices.docs) {
    const invoice = document.data();
    if (invoice.status !== "OVERDUE") {
      await document.ref.update({ status: "OVERDUE", overdueMarkedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      markedOverdue += 1;
    }
    const recipientId = invoice.createdBy;
    if (!recipientId) continue;
    const notificationRef = db.collection("notifications").doc(`finance-overdue-${document.id}`);
    await notificationRef.set({
      id: notificationRef.id,
      userId: recipientId,
      workspaceId: invoice.workspaceId,
      type: "FINANCE_INVOICE_OVERDUE",
      title: `Invoice ${invoice.invoiceNumber} is overdue`,
      message: `${invoice.clientNameSnapshot ?? "A client"} has an overdue invoice requiring follow-up.`,
      href: `/finance/invoices/${document.id}`,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  logger.info("Scheduled finance check", { invoicesChecked: invoices.size, markedOverdue });
});

async function createEmployeeExpiryNotification({ id, workspaceId, userId, title, message, link }: { id: string; workspaceId: string; userId?: string | null; title: string; message: string; link: string }) {
  if (!userId) return false;
  const reference = db.collection("notifications").doc(id);
  const existing = await reference.get();
  if (existing.exists) return false;
  await reference.create({ id, workspaceId, userId, title, message, type: "EMPLOYEE_EXPIRY", link, readAt: null, createdAt: FieldValue.serverTimestamp() });
  return true;
}

export const runScheduledEmployeeExpiryChecks = onSchedule("every day 06:00", async () => {
  const horizonDays = Math.max(1, Number(process.env.EMPLOYEE_CONTRACT_EXPIRY_DAYS ?? 60));
  const horizon = new Date(Date.now() + horizonDays * 86_400_000);
  const now = new Date();
  let notifications = 0;
  const [contracts, qualifications, training] = await Promise.all([
    db.collection("employeeContracts").where("endDate", "<=", horizon).get(),
    db.collection("employeeQualifications").where("expiryDate", "<=", horizon).get(),
    db.collection("employeeTraining").where("expiryDate", "<=", horizon).get(),
  ]);
  const employeeCache = new Map<string, FirebaseFirestore.DocumentData | null>();
  const employeeFor = async (employeeId: string) => {
    if (!employeeCache.has(employeeId)) employeeCache.set(employeeId, (await db.collection("employees").doc(employeeId).get()).data() ?? null);
    return employeeCache.get(employeeId) ?? null;
  };
  for (const document of contracts.docs) {
    const data = document.data();
    const endDate = asDate(data.endDate);
    if (!endDate) continue;
    const employee = await employeeFor(String(data.employeeId));
    if (!employee) continue;
    if (endDate < now) await document.ref.set({ status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (await createEmployeeExpiryNotification({ id: `employee-contract-expiry-${document.id}`, workspaceId: String(data.workspaceId), userId: employee.userId, title: "Employee contract expiry", message: `A contract for ${employee.preferredName || employee.firstName} ${employee.lastName} requires review.`, link: `/employees/${data.employeeId}` })) notifications += 1;
  }
  for (const document of qualifications.docs) {
    const data = document.data();
    const expiryDate = asDate(data.expiryDate);
    if (!expiryDate) continue;
    const employee = await employeeFor(String(data.employeeId));
    if (!employee) continue;
    if (expiryDate < now) await document.ref.set({ verificationStatus: "EXPIRED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (await createEmployeeExpiryNotification({ id: `employee-qualification-expiry-${document.id}`, workspaceId: String(data.workspaceId), userId: employee.userId, title: "Qualification expiry", message: `${data.name} requires verification or renewal.`, link: `/employees/${data.employeeId}` })) notifications += 1;
  }
  for (const document of training.docs) {
    const data = document.data();
    const expiryDate = asDate(data.expiryDate);
    if (!expiryDate) continue;
    const employee = await employeeFor(String(data.employeeId));
    if (!employee) continue;
    if (expiryDate < now) await document.ref.set({ completionStatus: "EXPIRED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (await createEmployeeExpiryNotification({ id: `employee-training-expiry-${document.id}`, workspaceId: String(data.workspaceId), userId: employee.userId, title: "Training expiry", message: `${data.name} requires renewal or review.`, link: `/employees/${data.employeeId}` })) notifications += 1;
  }
  logger.info("Scheduled employee expiry sweep", { contracts: contracts.size, qualifications: qualifications.size, training: training.size, notifications });
});

export const runScheduledEmployeeRetention = onSchedule("every day 04:15", async () => {
  const retentionDays = Math.max(30, Number(process.env.EMPLOYEE_RETENTION_DAYS ?? 2555));
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const snapshot = await db.collection("employees").where("status", "==", "ARCHIVED").get();
  let archived = 0;
  for (const employee of snapshot.docs) {
    const data = employee.data();
    const archivedAt = asDate(data.archivedAt);
    if (!archivedAt || archivedAt.getTime() > cutoff) continue;
    await employee.ref.set({ retentionState: "RETENTION_REVIEW", retentionReviewAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    archived += 1;
  }
  logger.info("Scheduled employee retention review", { archived, retentionDays });
});

export const runScheduledAttendanceChecks = onSchedule("every 15 minutes", async () => {
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const breaks = await db.collection("attendanceBreaks").where("status", "==", "ACTIVE").where("startedAt", "<=", cutoff).get();
  let exceptions = 0;
  for (const breakDocument of breaks.docs) {
    const breakData = breakDocument.data();
    const exceptionId = `attendance-long-break-${breakDocument.id}`;
    const exceptionRef = db.collection("attendanceExceptions").doc(exceptionId);
    const existing = await exceptionRef.get();
    if (existing.exists) continue;
    await exceptionRef.create({ id: exceptionId, workspaceId: breakData.workspaceId, employeeId: breakData.employeeId, exceptionType: "INCOMPLETE_BREAK", status: "OPEN", action: "BREAK_START", reason: "A break has remained open for more than four hours and requires review.", source: "SCHEDULED_CHECK", requiresApproval: true, relatedBreakId: breakDocument.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    exceptions += 1;
  }
  logger.info("Scheduled attendance hygiene check", { activeLongBreaks: breaks.size, exceptions });
});

export const runScheduledProjectChecks = onSchedule("every 30 minutes", async () => {
  const now = new Date();
  const projects = await db.collection("projects").where("status", "in", ["PLANNING", "APPROVED", "ACTIVE", "ON_HOLD", "AT_RISK"]).get();
  let healthUpdates = 0;
  let overdueNotifications = 0;
  for (const projectDocument of projects.docs) {
    const project = projectDocument.data();
    const [tasks, milestones, risks] = await Promise.all([
      db.collection("projectTasks").where("projectId", "==", projectDocument.id).limit(1000).get(),
      db.collection("projectMilestones").where("projectId", "==", projectDocument.id).limit(300).get(),
      db.collection("projectRisks").where("projectId", "==", projectDocument.id).limit(300).get(),
    ]);
    const taskData = tasks.docs.map((document) => document.data());
    const overdueTasks = taskData.filter((task) => !["COMPLETED", "CANCELLED"].includes(String(task.status)) && (asDate(task.dueDate)?.getTime() ?? 0) < now.getTime());
    const blockedTasks = taskData.filter((task) => task.status === "BLOCKED");
    const criticalRisks = risks.docs.filter((document) => document.data().severity === "CRITICAL" && !["RESOLVED", "CLOSED"].includes(String(document.data().status)));
    const missedMilestones = milestones.docs.filter((document) => document.data().status === "MISSED");
    const factors = [
      overdueTasks.length ? `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}` : null,
      blockedTasks.length ? `${blockedTasks.length} blocked task${blockedTasks.length === 1 ? "" : "s"}` : null,
      missedMilestones.length ? `${missedMilestones.length} missed milestone${missedMilestones.length === 1 ? "" : "s"}` : null,
      criticalRisks.length ? `${criticalRisks.length} critical open risk${criticalRisks.length === 1 ? "" : "s"}` : null,
    ].filter((factor): factor is string => Boolean(factor));
    const healthState = project.status === "ON_HOLD" ? "ON_HOLD" : criticalRisks.length || missedMilestones.length ? "CRITICAL" : blockedTasks.length || overdueTasks.length ? "AT_RISK" : "HEALTHY";
    const progress = taskData.length ? Math.round((taskData.filter((task) => task.status === "COMPLETED").length / taskData.length) * 100) : 0;
    await projectDocument.ref.set({ healthState, healthFactors: factors, healthCalculationVersion: 1, healthCalculatedAt: FieldValue.serverTimestamp(), progressPercentage: progress, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("projectHealthSnapshots").add({ workspaceId: project.workspaceId, projectId: projectDocument.id, healthState, factors, calculationVersion: 1, calculatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), source: "SCHEDULED_CHECK" });
    healthUpdates += 1;
    for (const taskDocument of tasks.docs) {
      const task = taskDocument.data();
      if (!overdueTasks.some((item) => item.taskReference === task.taskReference) || !task.assigneeId) continue;
      const employee = await db.collection("employees").doc(String(task.assigneeId)).get();
      const userId = employee.data()?.userId;
      if (!userId) continue;
      const notification = db.collection("notifications").doc(`project-task-overdue-${taskDocument.id}`);
      if ((await notification.get()).exists) continue;
      await notification.create({ id: notification.id, workspaceId: project.workspaceId, userId, title: "Project task overdue", message: `${task.taskReference || task.title} is overdue in ${project.name}.`, type: "PROJECT_TASK_OVERDUE", link: `/projects/${projectDocument.id}`, readAt: null, createdAt: FieldValue.serverTimestamp() });
      overdueNotifications += 1;
    }
  }
  logger.info("Scheduled project health sweep", { projects: projects.size, healthUpdates, overdueNotifications });
});
