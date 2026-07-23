import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, createHmac, randomUUID } from "node:crypto";

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

function publicHttpUrls(input: string) {
  const matches = input.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return Array.from(new Set(matches)).filter((value) => {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return !url.username && !url.password && !["localhost", "127.0.0.1", "::1"].includes(host) && !host.endsWith(".local") && !host.startsWith("10.") && !host.startsWith("192.168.") && !/^172\.(1[6-9]|2\d|3[01])\./.test(host) && !host.startsWith("169.254.");
    } catch { return false; }
  }).slice(0, 100);
}

export const runScheduledKnowledgeReviewChecks = onSchedule("every day 06:45", async () => {
  const now = new Date();
  const horizon = new Date(now.getTime() + Number(process.env.KNOWLEDGE_REVIEW_REMINDER_DAYS ?? 14) * 86_400_000);
  const [reviewDue, expiryDue] = await Promise.all([
    db.collection("knowledgeArticles").where("status", "==", "PUBLISHED").where("reviewDate", "<=", horizon).limit(1000).get(),
    db.collection("knowledgeArticles").where("status", "==", "PUBLISHED").where("expiryDate", "<=", now).limit(1000).get(),
  ]);
  let expired = 0;
  for (const document of expiryDue.docs) {
    const article = document.data();
    await document.ref.set({ status: "EXPIRED", expiredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    expired += 1;
    if (article.ownerId) {
      const notification = db.collection("notifications").doc(`knowledge-expired-${document.id}`);
      if (!(await notification.get()).exists) await notification.create({ id: notification.id, workspaceId: article.workspaceId, userId: article.ownerId, title: "Knowledge article expired", message: `${article.title} has reached its expiry date.`, type: "KNOWLEDGE_EXPIRY", link: `/knowledge/${document.id}`, readAt: null, createdAt: FieldValue.serverTimestamp() });
    }
  }
  let reminders = 0;
  for (const document of reviewDue.docs) {
    const article = document.data();
    if (!article.ownerId) continue;
    const reviewKey = asDate(article.reviewDate)?.toISOString().slice(0, 10) ?? "missing";
    const notification = db.collection("notifications").doc(`knowledge-review-${document.id}-${reviewKey}`);
    if ((await notification.get()).exists) continue;
    await notification.create({ id: notification.id, workspaceId: article.workspaceId, userId: article.ownerId, title: "Knowledge review due", message: `${article.title} is due for review.`, type: "KNOWLEDGE_REVIEW_DUE", link: `/knowledge/${document.id}`, readAt: null, createdAt: FieldValue.serverTimestamp() });
    reminders += 1;
  }
  await db.collection("knowledgeJobRuns").doc(`review-${now.toISOString().slice(0, 10)}`).set({ job: "review-checks", status: "COMPLETED", expired, reminders, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  logger.info("Scheduled knowledge review sweep", { expired, reminders });
});

export const runScheduledKnowledgeLinkChecks = onSchedule("every day 07:15", async () => {
  const articles = await db.collection("knowledgeArticles").where("status", "==", "PUBLISHED").where("visibility", "==", "PUBLIC").limit(500).get();
  let checked = 0;
  for (const document of articles.docs) {
    const article = document.data();
    for (const url of publicHttpUrls(`${article.contentHtml ?? ""} ${article.contentText ?? ""}`)) {
      let status = "UNKNOWN";
      let responseCode: number | null = null;
      try {
        const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000), redirect: "manual" });
        responseCode = response.status;
        status = response.ok ? "OK" : "BROKEN";
      } catch { status = "UNREACHABLE"; }
      await db.collection("knowledgeLinkChecks").doc(`${document.id}:${Buffer.from(url).toString("base64url").slice(0, 80)}`).set({ workspaceId: article.workspaceId, articleId: document.id, url, status, responseCode, checkedAt: FieldValue.serverTimestamp() }, { merge: true });
      checked += 1;
    }
  }
  await db.collection("knowledgeJobRuns").doc(`links-${new Date().toISOString().slice(0, 10)}`).set({ job: "link-checks", status: "COMPLETED", checked, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  logger.info("Scheduled knowledge link sweep", { articles: articles.size, checked });
});

type ReportingClause = [string, FirebaseFirestore.WhereFilterOp, unknown];
async function reportingRecords(collection: string, workspaceId: string, clauses: ReportingClause[] = [], limit = 10000): Promise<any[]> {
  let query: FirebaseFirestore.Query = db.collection(collection).where("workspaceId", "==", workspaceId);
  for (const [field, operator, value] of clauses) query = query.where(field, operator, value);
  return (await query.limit(limit).get()).docs.map((document) => ({ id: document.id, ...document.data() }));
}
async function reportingCount(collection: string, workspaceId: string, clauses: ReportingClause[] = []) { return (await reportingRecords(collection, workspaceId, clauses)).length; }
function reportingSum(records: FirebaseFirestore.DocumentData[], field: string) { return records.reduce((sum, record) => sum + Number(record[field] ?? 0), 0); }
function reportingGroups(records: FirebaseFirestore.DocumentData[], field: string) { const groups: Record<string, number> = {}; for (const record of records) { const key = String(record[field] ?? "Unassigned"); groups[key] = (groups[key] ?? 0) + 1; } return groups; }
function reportingCsvCell(value: unknown) { const text = String(value ?? ""); const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
function nextReportRun(now: Date, frequency: string) { const next = new Date(now); if (frequency === "WEEKLY") next.setDate(next.getDate() + 7); else if (frequency === "MONTHLY") next.setMonth(next.getMonth() + 1); else if (frequency === "QUARTERLY") next.setMonth(next.getMonth() + 3); else next.setDate(next.getDate() + 1); return next; }

async function writeReportingArea(workspaceId: string, area: string, metrics: Record<string, number>, sourceCollections: string[], generatedAt: Date, snapshot = false) {
  const periodKey = generatedAt.toISOString().slice(0, 10);
  const aggregateId = `${workspaceId}:${area}:current`;
  const payload = { workspaceId, area, metricKey: `${area}.summary`, metrics, sourceCollections, calculationVersion: 1, periodStart: new Date(generatedAt.getFullYear(), generatedAt.getMonth(), generatedAt.getDate()), periodEnd: new Date(generatedAt.getFullYear(), generatedAt.getMonth(), generatedAt.getDate() + 1), periodKey, generatedAt: FieldValue.serverTimestamp(), dataFreshness: "CURRENT", updatedAt: FieldValue.serverTimestamp() };
  await db.collection("reportingAggregates").doc(aggregateId).set(payload, { merge: true });
  if (snapshot) await db.collection("reportingSnapshots").doc(`${workspaceId}:${area}:day:${periodKey}`).set({ ...payload, id: `${workspaceId}:${area}:day:${periodKey}`, generatedBy: "scheduled-reporting-aggregation", snapshotType: "DAILY", createdAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function aggregateReportingWorkspace(workspaceId: string, snapshot: boolean) {
  const now = new Date();
  const [tickets, clients, assets, endpoints, employees, projects, invoices, payments, knowledge, audits, exceptions] = await Promise.all([
    reportingRecords("tickets", workspaceId), reportingRecords("clients", workspaceId), reportingRecords("assets", workspaceId), reportingRecords("endpoints", workspaceId), reportingRecords("employees", workspaceId), reportingRecords("projects", workspaceId), reportingRecords("invoices", workspaceId), reportingRecords("payments", workspaceId), reportingRecords("knowledgeArticles", workspaceId), reportingRecords("auditLogs", workspaceId), reportingRecords("attendanceExceptions", workspaceId),
  ]);
  const common = { openTickets: tickets.filter((item) => !["RESOLVED", "CLOSED"].includes(String(item.status))).length, criticalTickets: tickets.filter((item) => item.priority === "URGENT").length, activeClients: clients.filter((item) => item.status === "ACTIVE").length, onboardingClients: clients.filter((item) => item.status === "ONBOARDING").length, managedAssets: assets.length, healthyAssets: assets.filter((item) => item.healthState === "HEALTHY").length, atRiskAssets: assets.filter((item) => ["AT_RISK", "CRITICAL"].includes(String(item.healthState))).length, managedEndpoints: endpoints.length, offlineEndpoints: endpoints.filter((item) => item.checkInState === "OFFLINE").length, compliantEndpoints: endpoints.filter((item) => item.complianceState === "COMPLIANT").length, activeEmployees: employees.filter((item) => item.status === "ACTIVE").length, activeProjects: projects.filter((item) => ["ACTIVE", "APPROVED", "ON_HOLD"].includes(String(item.status))).length, atRiskProjects: projects.filter((item) => ["AT_RISK", "CRITICAL"].includes(String(item.healthState))).length, publishedArticles: knowledge.filter((item) => item.status === "PUBLISHED").length, articlesInReview: knowledge.filter((item) => item.status === "IN_REVIEW").length, openAttendanceExceptions: exceptions.filter((item) => item.status === "OPEN").length, auditEvents: audits.length };
  const activeInvoices = invoices.filter((item) => !["DRAFT", "VOID", "CANCELLED"].includes(String(item.status))); const outstandingMinorUnits = activeInvoices.reduce((sum, item) => sum + Number(item.totalMinorUnits ?? 0) - Number(item.amountPaidMinorUnits ?? 0), 0); const paymentsReceivedMinorUnits = reportingSum(payments, "amountMinorUnits");
  await writeReportingArea(workspaceId, "executive", { ...common, outstandingMinorUnits, paymentsReceivedMinorUnits }, ["tickets", "clients", "assets", "endpoints", "employees", "projects", "invoices", "payments", "knowledgeArticles", "attendanceExceptions", "auditLogs"], now, snapshot);
  await Promise.all([
    writeReportingArea(workspaceId, "service-desk", { openTickets: common.openTickets, criticalTickets: common.criticalTickets, createdTickets: tickets.length, statusGroups: Object.keys(reportingGroups(tickets, "status")).length }, ["tickets"], now, snapshot),
    writeReportingArea(workspaceId, "clients", { activeClients: common.activeClients, onboardingClients: common.onboardingClients, formerClients: clients.filter((item) => item.status === "FORMER").length }, ["clients", "contracts"], now, snapshot),
    writeReportingArea(workspaceId, "assets", { managedAssets: common.managedAssets, healthyAssets: common.healthyAssets, atRiskAssets: common.atRiskAssets }, ["assets", "assetWarranties"], now, snapshot),
    writeReportingArea(workspaceId, "networks", { managedEndpoints: common.managedEndpoints, offlineEndpoints: common.offlineEndpoints, compliantEndpoints: common.compliantEndpoints }, ["endpoints", "networkAlerts"], now, snapshot),
    writeReportingArea(workspaceId, "employees", { activeEmployees: common.activeEmployees, onboardingEmployees: employees.filter((item) => item.lifecycleState === "ONBOARDING").length, offboardingEmployees: employees.filter((item) => item.lifecycleState === "OFFBOARDING").length }, ["employees", "employeeContracts", "employeeTraining", "employeeQualifications"], now, snapshot),
    writeReportingArea(workspaceId, "projects", { activeProjects: common.activeProjects, atRiskProjects: common.atRiskProjects }, ["projects", "projectTasks", "projectMilestones", "projectTimeEntries"], now, snapshot),
    writeReportingArea(workspaceId, "finance", { outstandingMinorUnits, paymentsReceivedMinorUnits, invoiceCount: activeInvoices.length }, ["invoices", "payments", "quotes", "expenses", "purchaseOrders"], now, snapshot),
    writeReportingArea(workspaceId, "knowledge", { publishedArticles: common.publishedArticles, articlesInReview: common.articlesInReview }, ["knowledgeArticles", "knowledgeFeedback", "knowledgeSearchEvents", "policyAcknowledgements"], now, snapshot),
    writeReportingArea(workspaceId, "security", { auditEvents: common.auditEvents, endpointEnrolments: await reportingCount("endpointEnrollments", workspaceId) }, ["auditLogs", "reportExports", "endpointEnrollments"], now, snapshot),
  ]);
}

export const runScheduledReportingAggregation = onSchedule("every 60 minutes", async () => {
  const workspaces = await db.collection("workspaces").limit(100).get(); const generatedAt = new Date(); let completed = 0; for (const workspace of workspaces.docs) { try { await aggregateReportingWorkspace(workspace.id, false); completed += 1; } catch (error) { await db.collection("reportingRebuildJobs").doc(`aggregation-failure-${workspace.id}-${generatedAt.toISOString().slice(0, 13)}`).set({ workspaceId: workspace.id, jobType: "AGGREGATION", status: "FAILED", error: String(error), createdAt: FieldValue.serverTimestamp() }, { merge: true }); } } logger.info("Reporting aggregation sweep", { workspaces: workspaces.size, completed });
});

export const runScheduledReportingSnapshots = onSchedule("every day 01:30", async () => {
  const workspaces = await db.collection("workspaces").limit(100).get(); let completed = 0; for (const workspace of workspaces.docs) { try { await aggregateReportingWorkspace(workspace.id, true); completed += 1; } catch (error) { await db.collection("reportingRebuildJobs").doc(`snapshot-failure-${workspace.id}-${new Date().toISOString().slice(0, 10)}`).set({ workspaceId: workspace.id, jobType: "SNAPSHOT", status: "FAILED", error: String(error), createdAt: FieldValue.serverTimestamp() }, { merge: true }); } } logger.info("Reporting snapshot sweep", { workspaces: workspaces.size, completed });
});

export const runScheduledReportExports = onSchedule("every 15 minutes", async () => {
  const queued = await db.collection("reportExports").where("status", "==", "QUEUED").limit(20).get(); let completed = 0; for (const document of queued.docs) { const report = document.data(); await document.ref.set({ status: "RUNNING", startedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); try { const aggregate = await db.collection("reportingAggregates").doc(`${report.workspaceId}:${report.area}:current`).get(); if (!aggregate.exists) throw new Error("Reporting aggregate is not available yet."); const data = aggregate.data() ?? {}; const lines = ["metric,value", ...Object.entries((data.metrics ?? {}) as Record<string, unknown>).map(([key, value]) => `${reportingCsvCell(key)},${reportingCsvCell(value)}`)].join("\n"); const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? process.env.FIREBASE_STORAGE_BUCKET ?? app.options.storageBucket; if (!bucketName) throw new Error("Storage bucket is not configured."); const storagePath = `workspaces/${report.workspaceId}/reports/exports/${document.id}/report.${String(report.format).toLowerCase() === "markdown" ? "md" : "csv"}`; await getStorage(app).bucket(bucketName).file(storagePath).save(Buffer.from(lines), { metadata: { contentType: String(report.format).toLowerCase() === "markdown" ? "text/markdown" : "text/csv" }, resumable: false }); await document.ref.set({ status: "COMPLETED", storagePath, rowCount: Object.keys((data.metrics ?? {}) as Record<string, unknown>).length, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); completed += 1; } catch (error) { await document.ref.set({ status: "FAILED", error: String(error).slice(0, 500), failureCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); } } logger.info("Report export sweep", { queued: queued.size, completed });
});

export const runScheduledReportSchedules = onSchedule("every 15 minutes", async () => {
  const now = new Date();
  const schedules = await db.collection("reportSchedules").where("active", "==", true).where("nextRunAt", "<=", now).limit(100).get();
  let executions = 0;
  for (const scheduleDocument of schedules.docs) {
    const schedule = scheduleDocument.data();
    const bucket = now.toISOString().slice(0, 13);
    const executionId = `${scheduleDocument.id}:${bucket}`;
    const execution = db.collection("reportExecutions").doc(executionId);
    if ((await execution.get()).exists) continue;
    await execution.create({ id: executionId, workspaceId: schedule.workspaceId, ownerId: schedule.ownerId, scheduleId: scheduleDocument.id, reportId: schedule.reportId, status: "QUEUED", idempotencyKey: executionId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await db.collection("reportExports").doc(`${executionId}:export`).create({ id: `${executionId}:export`, workspaceId: schedule.workspaceId, requestedBy: schedule.ownerId, area: schedule.area ?? "executive", format: schedule.format, status: "QUEUED", sourceExecutionId: executionId, idempotencyKey: `${executionId}:export`, expiresAt: new Date(Date.now() + 30 * 86400000), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await scheduleDocument.ref.set({ lastRunAt: FieldValue.serverTimestamp(), nextRunAt: nextReportRun(now, String(schedule.frequency ?? "DAILY")), lastResult: "QUEUED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    executions += 1;
  }
  logger.info("Report schedule sweep", { schedules: schedules.size, executions });
});

export const runScheduledReportExecutionReconciliation = onSchedule("every 15 minutes", async () => {
  const queued = await db.collection("reportExecutions").where("status", "==", "QUEUED").limit(100).get();
  let updated = 0;
  for (const execution of queued.docs) {
    const exportDocument = await db.collection("reportExports").doc(`${execution.id}:export`).get();
    if (!exportDocument.exists) continue;
    const status = exportDocument.data()?.status;
    if (status === "COMPLETED" || status === "FAILED") {
      await execution.ref.set({ status, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      updated += 1;
    }
  }
  logger.info("Report execution reconciliation", { queued: queued.size, updated });
});

export const runScheduledAiRetention = onSchedule("every day 02:15", async () => {
  const now = new Date();
  const conversations = await db.collection("aiConversations").where("expiresAt", "<", now).limit(100).get();
  let deleted = 0;
  for (const conversation of conversations.docs) {
    const [messages, proposals] = await Promise.all([
      db.collection("aiMessages").where("conversationId", "==", conversation.id).limit(400).get(),
      db.collection("aiActionProposals").where("conversationId", "==", conversation.id).limit(100).get(),
    ]);
    const batch = db.batch();
    messages.docs.forEach((document) => batch.delete(document.ref));
    proposals.docs.forEach((document) => batch.delete(document.ref));
    batch.delete(conversation.ref);
    await batch.commit();
    deleted += 1;
  }
  logger.info("AI retention sweep", { conversations: conversations.size, deleted });
});

function eventData(value: any) {
  return value?.data ? value.data() : null;
}

function eventTriggerKey(collection: string, before: any, after: any) {
  if (!before) return `${collection}.created`;
  if (before.status !== after.status && after.status) return `${collection}.status_changed`;
  if (before.priority !== after.priority && after.priority) return `${collection}.priority_changed`;
  return `${collection}.updated`;
}

async function normaliseAutomationEvent(collection: string, event: any) {
  const after = eventData(event.data?.after);
  const before = eventData(event.data?.before);
  if (!after?.workspaceId) return;
  const triggerKey = eventTriggerKey(collection, before, after);
  const eventId = String(event.id ?? `${collection}:${event.params?.[`${collection}Id`] ?? "event"}:${Date.now()}`);
  const triggerId = `${after.workspaceId}:${eventId}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 500);
  const triggerReference = db.collection("automationTriggers").doc(triggerId);
  const existing = await triggerReference.get();
  if (existing.exists) return;
  await triggerReference.create({ id: triggerId, workspaceId: after.workspaceId, triggerEventId: eventId, triggerKey, payload: { recordId: event.params?.ticketId ?? event.params?.clientId ?? event.params?.assetId ?? event.params?.endpointId ?? event.params?.employeeId ?? event.params?.invoiceId ?? null, previous: before ?? {}, new: after, metadata: { source: "firestore", collection } }, status: "RECEIVED", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}

export const ingestTicketAutomationEvents = onDocumentWritten("tickets/{ticketId}", async (event) => normaliseAutomationEvent("ticket", event));
export const ingestClientAutomationEvents = onDocumentWritten("clients/{clientId}", async (event) => normaliseAutomationEvent("client", event));
export const ingestAssetAutomationEvents = onDocumentWritten("assets/{assetId}", async (event) => normaliseAutomationEvent("asset", event));
export const ingestEndpointAutomationEvents = onDocumentWritten("endpoints/{endpointId}", async (event) => normaliseAutomationEvent("endpoint", event));
export const ingestEmployeeAutomationEvents = onDocumentWritten("employees/{employeeId}", async (event) => normaliseAutomationEvent("employee", event));
export const ingestInvoiceAutomationEvents = onDocumentWritten("invoices/{invoiceId}", async (event) => normaliseAutomationEvent("finance.invoice", event));

async function queueAutomationTrigger(triggerDocument: FirebaseFirestore.QueryDocumentSnapshot) {
  const trigger = triggerDocument.data();
  if (trigger.status !== "RECEIVED" || !trigger.workspaceId) return false;
  const workflows = await db.collection("automationWorkflows").where("workspaceId", "==", trigger.workspaceId).where("active", "==", true).where("triggerKey", "==", trigger.triggerKey).limit(50).get();
  let queued = false;
  for (const workflowDocument of workflows.docs) {
    const workflow = workflowDocument.data();
    if (!workflow.activeVersion) continue;
    const versionDocument = await db.collection("automationVersions").doc(`${workflowDocument.id}:v:${workflow.activeVersion}`).get();
    const definition = versionDocument.data()?.definition;
    // Conditional events remain visible for the trusted application runner, which has the shared validator.
    if (definition?.trigger?.conditions) continue;
    const idempotencyId = `${trigger.workspaceId}:${workflowDocument.id}:${trigger.triggerEventId}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 500);
    const idempotencyReference = db.collection("automationIdempotency").doc(idempotencyId);
    const claimed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(idempotencyReference);
      if (current.exists) return false;
      transaction.create(idempotencyReference, { id: idempotencyId, workspaceId: trigger.workspaceId, workflowId: workflowDocument.id, triggerEventId: trigger.triggerEventId, status: "CLAIMED", expiresAt: new Date(Date.now() + 30 * 86400000), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) continue;
    const executionId = `execution_${triggerDocument.id}_${workflowDocument.id}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 500);
    await db.collection("automationExecutions").doc(executionId).create({ id: executionId, workspaceId: trigger.workspaceId, workflowId: workflowDocument.id, workflowVersion: workflow.activeVersion, triggerKey: trigger.triggerKey, triggerEventId: trigger.triggerEventId, actorId: null, currentStep: 0, status: "QUEUED", input: trigger.payload, stepResults: [], retryCount: 0, parentExecutionId: null, childExecutionIds: [], correlationId: trigger.triggerEventId, causationId: null, idempotencyKey: idempotencyId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), startedAt: null, completedAt: null, nextExecutionAt: null, error: null });
    await idempotencyReference.update({ executionId, status: "QUEUED", updatedAt: FieldValue.serverTimestamp() });
    queued = true;
  }
  await triggerDocument.ref.update({ status: queued ? "QUEUED" : "REVIEW_REQUIRED", updatedAt: FieldValue.serverTimestamp() });
  return queued;
}

export const runScheduledAutomationTriggerMatching = onSchedule("every 5 minutes", async () => {
  const triggers = await db.collection("automationTriggers").where("status", "==", "RECEIVED").limit(100).get();
  let queued = 0;
  for (const trigger of triggers.docs) if (await queueAutomationTrigger(trigger)) queued += 1;
  logger.info("Automation trigger matching sweep", { received: triggers.size, queued });
});

async function processAutomationExecution(executionDocument: FirebaseFirestore.QueryDocumentSnapshot) {
  const execution = executionDocument.data();
  if (execution.status !== "QUEUED") return false;
  const workflow = await db.collection("automationWorkflows").doc(execution.workflowId).get();
  const version = await db.collection("automationVersions").doc(`${execution.workflowId}:v:${execution.workflowVersion}`).get();
  const definition = version.data()?.definition;
  if (!workflow.exists || !version.exists || !definition?.steps) { await executionDocument.ref.update({ status: "DEAD_LETTER", error: "Immutable workflow version unavailable.", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); return false; }
  const claimed = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(executionDocument.ref);
    if (current.data()?.status !== "QUEUED") return false;
    transaction.update(executionDocument.ref, { status: "RUNNING", startedAt: current.data()?.startedAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) return false;
  for (let index = Number(execution.currentStep ?? 0); index < Math.min(definition.steps.length, 40); index += 1) {
    const step = definition.steps[index];
    if (!step.enabled) continue;
    const action = String(step.action ?? step.type);
    if (["send_approved_email", "send_webhook", "notify_client_contact", "create_offboarding_task"].includes(action) || action === "require_approval" || step.type === "approval") {
      const approvalId = `${executionDocument.id}:${step.id}`;
      await db.collection("automationApprovals").doc(approvalId).set({ id: approvalId, workspaceId: execution.workspaceId, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, executionId: executionDocument.id, stepId: step.id, requesterId: execution.actorId, requestedAction: action, actionPayload: step.config ?? {}, affectedRecords: execution.input ?? {}, reason: step.config?.reason ?? "Approval required", status: "PENDING", deadlineAt: new Date(Date.now() + 48 * 3600000), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await executionDocument.ref.update({ status: "WAITING_FOR_APPROVAL", currentStep: index, updatedAt: FieldValue.serverTimestamp() });
      return true;
    }
    if (action === "delay" || action === "wait_until" || step.type === "delay") {
      const nextExecutionAt = new Date(Date.now() + Math.min(Math.max(Number(step.config?.seconds ?? 60), 1), 2592000) * 1000);
      await executionDocument.ref.update({ status: "WAITING", currentStep: index + 1, nextExecutionAt, updatedAt: FieldValue.serverTimestamp() });
      return true;
    }
    if (["create_in_app_notification", "notify_user", "notify_manager", "notify_team"].includes(action)) {
      const recipientId = String(step.config?.userId ?? execution.actorId ?? "");
      const recipient = await db.collection("users").doc(recipientId).get();
      if (!recipient.exists || recipient.data()?.workspaceId !== execution.workspaceId) { await executionDocument.ref.update({ status: "DEAD_LETTER", error: "Notification recipient is outside the workspace.", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); return false; }
      const notificationId = `notification_${executionDocument.id}_${step.id}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 500);
      await db.collection("notifications").doc(notificationId).set({ id: notificationId, workspaceId: execution.workspaceId, userId: recipientId, type: "AUTOMATION", title: String(step.config?.title ?? "SourceHub automation"), message: String(step.config?.message ?? "An automation requires your attention.").slice(0, 2000), link: step.config?.link ?? null, readAt: null, createdAt: FieldValue.serverTimestamp() }, { merge: false });
    } else {
      await executionDocument.ref.update({ status: "DEAD_LETTER", error: `Action '${action}' requires a configured trusted provider.`, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return false;
    }
    await db.collection("automationStepExecutions").doc(`${executionDocument.id}:${step.id}`).set({ id: `${executionDocument.id}:${step.id}`, workspaceId: execution.workspaceId, executionId: executionDocument.id, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, stepId: step.id, action, status: "COMPLETED", input: { configured: true }, output: { completed: true }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await executionDocument.ref.update({ status: "COMPLETED", currentStep: definition.steps.length, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return true;
}

export const runScheduledAutomationExecutions = onSchedule("every 5 minutes", async () => {
  const executions = await db.collection("automationExecutions").where("status", "==", "QUEUED").limit(50).get();
  let processed = 0;
  for (const execution of executions.docs) if (await processAutomationExecution(execution)) processed += 1;
  logger.info("Automation execution sweep", { queued: executions.size, processed });
});

export const runScheduledAutomationRetention = onSchedule("every day 03:15", async () => {
  const expiry = new Date(Date.now() - 90 * 86400000);
  const executions = await db.collection("automationExecutions").where("completedAt", "<", expiry).limit(200).get();
  let deleted = 0;
  for (const execution of executions.docs) {
    const steps = await db.collection("automationStepExecutions").where("executionId", "==", execution.id).limit(100).get();
    const batch = db.batch();
    steps.docs.forEach((step) => batch.delete(step.ref));
    batch.delete(execution.ref);
    await batch.commit();
    deleted += 1;
  }
  logger.info("Automation retention sweep", { candidates: executions.size, deleted });
});

export const sendMobileNotification = onDocumentCreated("notifications/{notificationId}", async (event) => {
  const notification = event.data?.data();
  if (!notification?.workspaceId || !notification.userId) return;
  const tokens = await db.collection("mobilePushTokens").where("workspaceId", "==", notification.workspaceId).where("userId", "==", notification.userId).where("status", "==", "ACTIVE").limit(20).get();
  if (tokens.empty) return;
  const tokenDocuments = tokens.docs;
  const response = await getMessaging(app).sendEachForMulticast({ tokens: tokenDocuments.map((document) => String(document.data().token)), notification: { title: "SourceHub", body: "You have a new SourceHub notification." }, data: { notificationId: String(event.params.notificationId), link: typeof notification.link === "string" ? notification.link.slice(0, 500) : "" } });
  for (let index = 0; index < response.responses.length; index += 1) {
    const delivery = response.responses[index];
    if (!delivery.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(String(delivery.error?.code ?? ""))) await tokenDocuments[index].ref.update({ status: "INVALID", invalidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
  logger.info("Mobile push delivery", { notificationId: event.params.notificationId, attempted: tokens.size, success: response.successCount, failure: response.failureCount });
});

export const runScheduledMobileRetention = onSchedule("every day 04:15", async () => {
  const now = new Date();
  const [sessions, locations, operations] = await Promise.all([
    db.collection("mobileSessions").where("expiresAt", "<", now).limit(200).get(),
    db.collection("mobileLocationEvents").where("expiresAt", "<", now).limit(200).get(),
    db.collection("mobileSyncOperations").where("expiresAt", "<", now).limit(200).get(),
  ]);
  const batch = db.batch();
  sessions.docs.forEach((document) => batch.delete(document.ref));
  locations.docs.forEach((document) => batch.delete(document.ref));
  operations.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  logger.info("Mobile retention sweep", { sessions: sessions.size, locations: locations.size, operations: operations.size });
});

function enterpriseSecretHash(secret: string) {
  const pepper = process.env.ENTERPRISE_API_KEY_PEPPER ?? "development-enterprise-pepper-change-me";
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

function webhookIsSafe(endpointUrl: string) {
  try {
    const url = new URL(endpointUrl);
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) return false;
    if (["127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname) || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal") || url.hostname.endsWith(".invalid")) return false;
    return true;
  } catch {
    return false;
  }
}

function resolveWebhookSecret(subscription: Record<string, unknown>) {
  const secret = process.env.ENTERPRISE_WEBHOOK_DEV_SECRET;
  const configuredRef = process.env.ENTERPRISE_WEBHOOK_SECRET_REF;
  if (!secret) return null;
  if (subscription.secretRef && configuredRef && subscription.secretRef === configuredRef) return secret;
  if (process.env.NODE_ENV !== "production" && subscription.secretHash === enterpriseSecretHash(secret)) return secret;
  return null;
}

export const queueEnterpriseTicketWebhooks = onDocumentWritten("tickets/{ticketId}", async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after?.workspaceId || !after.subject) return;
  const eventType = before ? "ticket.updated" : "ticket.created";
  const subscriptions = await db.collection("webhookSubscriptions").where("workspaceId", "==", after.workspaceId).where("active", "==", true).where("eventTypes", "array-contains", eventType).limit(50).get();
  for (const subscriptionDocument of subscriptions.docs) {
    const subscription = subscriptionDocument.data();
    const deliveryId = `${subscriptionDocument.id}:${event.params.ticketId}:${eventType}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 500);
    await db.collection("webhookDeliveries").doc(deliveryId).set({
      id: deliveryId,
      workspaceId: after.workspaceId,
      subscriptionId: subscriptionDocument.id,
      eventId: randomUUID(),
      eventType,
      payloadVersion: subscription.payloadVersion ?? "2026-07-01",
      payload: { id: event.params.ticketId, referenceNumber: after.referenceNumber ?? null, subject: String(after.subject).slice(0, 240), status: after.status ?? null, priority: after.priority ?? null, clientId: after.clientId ?? null },
      status: "QUEUED",
      attempts: 0,
      nextAttemptAt: new Date(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
});

export const runScheduledEnterpriseWebhookDelivery = onSchedule("every 1 minutes", async () => {
  const now = new Date();
  const deliveries = await db.collection("webhookDeliveries").where("status", "in", ["QUEUED", "RETRY"]).where("nextAttemptAt", "<=", now).limit(50).get();
  let delivered = 0;
  for (const deliveryDocument of deliveries.docs) {
    const claimed: Record<string, any> | null = await db.runTransaction(async (transaction): Promise<Record<string, any> | null> => {
      const current = await transaction.get(deliveryDocument.ref);
      if (!current.exists || !["QUEUED", "RETRY"].includes(String(current.data()?.status))) return null;
      const attempts = Number(current.data()?.attempts ?? 0) + 1;
      transaction.update(deliveryDocument.ref, { status: "DELIVERING", attempts, updatedAt: FieldValue.serverTimestamp() });
      return { ...current.data(), attempts };
    });
    if (!claimed) continue;
    const subscriptionDocument = await db.collection("webhookSubscriptions").doc(String(claimed.subscriptionId)).get();
    const subscription = subscriptionDocument.data();
    const secret = subscription ? resolveWebhookSecret(subscription) : null;
    const endpointUrl = String(subscription?.endpointUrl ?? "");
    if (!subscriptionDocument.exists || subscription?.active !== true || !secret || !webhookIsSafe(endpointUrl)) {
      await deliveryDocument.ref.update({ status: "BLOCKED", error: "Webhook secret, subscription, or endpoint safety configuration is incomplete.", updatedAt: FieldValue.serverTimestamp() });
      continue;
    }
    const eventId = String(claimed.eventId);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({ id: eventId, type: claimed.eventType, version: claimed.payloadVersion, data: claimed.payload });
    const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${eventId}.${payload}`).digest("hex")}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.ENTERPRISE_WEBHOOK_TIMEOUT_MS ?? 10000));
      const response = await fetch(endpointUrl, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "SourceHub-Webhook/1.0", "X-SourceHub-Event": String(claimed.eventType), "X-SourceHub-Event-Id": eventId, "X-SourceHub-Timestamp": timestamp, "X-SourceHub-Signature": signature }, body: payload, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
      await deliveryDocument.ref.update({ status: "DELIVERED", deliveredAt: FieldValue.serverTimestamp(), responseStatus: response.status, updatedAt: FieldValue.serverTimestamp() });
      delivered += 1;
    } catch (error) {
      const attempts = Number(claimed.attempts ?? 1);
      const terminal = attempts >= 5;
      await deliveryDocument.ref.update({ status: terminal ? "FAILED" : "RETRY", error: error instanceof Error ? error.message.slice(0, 500) : "Webhook delivery failed.", nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 2 ** attempts * 30_000)), updatedAt: FieldValue.serverTimestamp() });
      if (terminal) await db.collection("securityAlerts").doc(`webhook:${deliveryDocument.id}`).set({ id: `webhook:${deliveryDocument.id}`, workspaceId: claimed.workspaceId, type: "WEBHOOK_DELIVERY_FAILED", severity: "HIGH", status: "OPEN", description: "A configured enterprise webhook reached its retry limit.", relatedId: deliveryDocument.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  logger.info("Enterprise webhook delivery sweep", { queued: deliveries.size, delivered });
});

export const runScheduledEnterpriseRetention = onSchedule("every day 03:45", async () => {
  const now = new Date();
  const collections = ["enterpriseSessions", "apiRateLimits", "apiAuditEvents", "enterpriseAuditEvents"];
  let deleted = 0;
  for (const collection of collections) {
    const snapshot = await db.collection(collection).where("expiresAt", "<", now).limit(400).get();
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    if (!snapshot.empty) await batch.commit();
    deleted += snapshot.size;
  }
  logger.info("Enterprise retention sweep", { deleted });
});

export const runScheduledEnterpriseSecurityChecks = onSchedule("every 15 minutes", async () => {
  const since = new Date(Date.now() - 15 * 60_000);
  const rejected = await db.collection("apiAuditEvents").where("result", "==", "REJECTED").limit(200).get();
  let alerts = 0;
  for (const document of rejected.docs) {
    const event = document.data();
    const createdAt = asDate(event.createdAt);
    if (!createdAt || createdAt < since || !event.workspaceId) continue;
    const alertId = `api-rejected:${event.workspaceId}:${event.credentialId ?? "unknown"}:${createdAt.toISOString().slice(0, 13)}`;
    await db.collection("securityAlerts").doc(alertId).set({ id: alertId, workspaceId: event.workspaceId, type: "API_AUTHENTICATION_FAILURE", severity: "MEDIUM", status: "OPEN", description: "An enterprise API request was rejected and requires review.", relatedId: document.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    alerts += 1;
  }
  logger.info("Enterprise security check", { rejectedEvents: rejected.size, alerts });
});

export const runScheduledEnterpriseContinuityChecks = onSchedule("every day 05:00", async () => {
  const workspaces = await db.collection("workspaces").limit(100).get();
  let notReady = 0;
  for (const workspaceDocument of workspaces.docs) {
    const workspaceId = workspaceDocument.id;
    const policy = await db.collection("backupPolicies").doc(`${workspaceId}:default`).get();
    if (policy.data()?.status === "CONFIGURED") continue;
    notReady += 1;
    const alertId = `continuity:${workspaceId}`;
    await db.collection("securityAlerts").doc(alertId).set({ id: alertId, workspaceId, type: "BACKUP_NOT_CONFIGURED", severity: "HIGH", status: "OPEN", description: "Managed backup and restore verification is not configured for this workspace.", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  logger.info("Enterprise continuity check", { workspaces: workspaces.size, notReady });
});

const commercialDeletionCollections = [
  "commercialTenants", "tenantMemberships", "tenantInvitations", "tenantProvisioningJobs", "tenantSettings", "tenantBranding", "tenantDomains", "commercialSubscriptions", "commercialEntitlements", "commercialTenantOverrides", "commercialBillingCustomers", "commercialBillingActions", "commercialInvoices", "commercialUsageDaily", "commercialUsageMonthly", "commercialUsageQuotas", "commercialOnboarding", "commercialIntegrationInstallations", "commercialDataJobs", "commercialExports", "commercialImports", "commercialSupportSessions", "commercialOperationalMetrics",
];

export const runScheduledCommercialProvisioning = onSchedule("every 5 minutes", async () => {
  if (process.env.COMMERCIAL_SAAS_ENABLED !== "true") return;
  const jobs = await db.collection("tenantProvisioningJobs").where("status", "==", "QUEUED").limit(50).get();
  let completed = 0;
  for (const jobDocument of jobs.docs) {
    const claimed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(jobDocument.ref);
      if (current.data()?.status !== "QUEUED") return false;
      transaction.update(jobDocument.ref, { status: "RUNNING", attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) continue;
    const tenantId = String(jobDocument.data().tenantId);
    await db.collection("commercialOnboarding").doc(tenantId).set({ id: tenantId, tenantId, workspaceId: tenantId, currentStep: "organization", completedSteps: [], skippedSteps: [], essentialModules: [], status: "IN_PROGRESS", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("commercialTenants").doc(tenantId).set({ lifecycleState: "TRIAL", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await db.collection("commercialSubscriptions").doc(tenantId).set({ lifecycleState: "TRIAL", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await jobDocument.ref.update({ status: "COMPLETED", currentStep: "ready", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    completed += 1;
  }
  logger.info("Commercial provisioning sweep", { queued: jobs.size, completed });
});

export const runScheduledCommercialUsageAggregation = onSchedule("every 15 minutes", async () => {
  if (process.env.COMMERCIAL_SAAS_ENABLED !== "true") return;
  const since = new Date(Date.now() - 32 * 86400000);
  const events = await db.collection("commercialUsageEvents").where("createdAt", ">=", since).limit(5000).get();
  const aggregates = new Map<string, { tenantId: string; metric: string; day: string; month: string; quantity: number }>();
  for (const document of events.docs) {
    const event = document.data();
    const createdAt = asDate(event.createdAt);
    if (!createdAt || !event.tenantId || !event.metric) continue;
    const day = createdAt.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const key = `${event.tenantId}:${event.metric}:${day}`;
    const current = aggregates.get(key) ?? { tenantId: String(event.tenantId), metric: String(event.metric), day, month, quantity: 0 };
    current.quantity += Number(event.quantity ?? 0);
    aggregates.set(key, current);
  }
  const batch = db.batch();
  for (const aggregate of aggregates.values()) {
    const dailyId = `${aggregate.tenantId}:${aggregate.metric}:${aggregate.day}`.replace(/[^a-zA-Z0-9:_-]/g, "_");
    const monthlyId = `${aggregate.tenantId}:${aggregate.metric}:${aggregate.month}`.replace(/[^a-zA-Z0-9:_-]/g, "_");
    batch.set(db.collection("commercialUsageDaily").doc(dailyId), { id: dailyId, tenantId: aggregate.tenantId, workspaceId: aggregate.tenantId, metric: aggregate.metric, periodKey: aggregate.day, quantity: aggregate.quantity, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(db.collection("commercialUsageMonthly").doc(monthlyId), { id: monthlyId, tenantId: aggregate.tenantId, workspaceId: aggregate.tenantId, metric: aggregate.metric, periodKey: aggregate.month, quantity: aggregate.quantity, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (aggregates.size) await batch.commit();
  logger.info("Commercial usage aggregation sweep", { events: events.size, aggregates: aggregates.size });
});

export const runScheduledCommercialLifecycle = onSchedule("every hour", async () => {
  if (process.env.COMMERCIAL_SAAS_ENABLED !== "true") return;
  const now = new Date();
  const trials = await db.collection("commercialSubscriptions").where("lifecycleState", "==", "TRIAL").where("trialEndsAt", "<=", now).limit(100).get();
  for (const subscription of trials.docs) {
    const graceUntil = new Date(Date.now() + 7 * 86400000);
    await subscription.ref.update({ lifecycleState: "GRACE_PERIOD", graceUntil, updatedAt: FieldValue.serverTimestamp() });
    await db.collection("commercialTenants").doc(subscription.id).set({ lifecycleState: "GRACE_PERIOD", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  const grace = await db.collection("commercialSubscriptions").where("lifecycleState", "==", "GRACE_PERIOD").where("graceUntil", "<=", now).limit(100).get();
  for (const subscription of grace.docs) {
    await subscription.ref.update({ lifecycleState: "SUSPENDED", updatedAt: FieldValue.serverTimestamp() });
    await db.collection("commercialTenants").doc(subscription.id).set({ lifecycleState: "SUSPENDED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  logger.info("Commercial lifecycle sweep", { trialsExpired: trials.size, graceExpired: grace.size });
});

export const runScheduledCommercialRetention = onSchedule("every day 04:45", async () => {
  const now = new Date();
  const targets = [
    ["commercialUsageEvents", "expiresAt"],
    ["tenantInvitations", "expiresAt"],
    ["commercialSupportSessions", "expiresAt"],
    ["commercialExports", "expiresAt"],
  ] as const;
  let deleted = 0;
  for (const [collection, field] of targets) {
    const snapshot = await db.collection(collection).where(field, "<", now).limit(400).get();
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    if (!snapshot.empty) await batch.commit();
    deleted += snapshot.size;
  }
  logger.info("Commercial retention sweep", { deleted });
});

export const runScheduledCommercialDeletion = onSchedule("every day 05:30", async () => {
  const jobs = await db.collection("commercialLifecycleJobs").where("type", "==", "DELETION").where("status", "==", "SCHEDULED").where("deletionAt", "<=", new Date()).limit(10).get();
  let archived = 0;
  for (const jobDocument of jobs.docs) {
    const tenantId = String(jobDocument.data().tenantId);
    if (tenantId === "source-it-services") { await jobDocument.ref.update({ status: "BLOCKED_INTERNAL_TENANT", updatedAt: FieldValue.serverTimestamp() }); continue; }
    let deleted = 0;
    let remaining = false;
    for (const collection of commercialDeletionCollections) {
      const snapshot = await db.collection(collection).where("tenantId", "==", tenantId).limit(200).get();
      const batch = db.batch();
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      if (snapshot.size === 200) remaining = true;
      if (!snapshot.empty) await batch.commit();
      deleted += snapshot.size;
    }
    if (remaining) await jobDocument.ref.update({ status: "SCHEDULED", deletedRecords: FieldValue.increment(deleted), nextRunAt: new Date(Date.now() + 60000), verification: { tenantScopedQuery: true, internalTenantProtected: true }, updatedAt: FieldValue.serverTimestamp() });
    else { await jobDocument.ref.update({ status: "COMPLETED", deletedRecords: FieldValue.increment(deleted), verification: { tenantScopedQuery: true, internalTenantProtected: true }, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); archived += 1; }
  }
  logger.info("Commercial deletion sweep", { jobs: jobs.size, archived });
});

export const runScheduledCommercialOperations = onSchedule("every 30 minutes", async () => {
  const tenants = await db.collection("commercialTenants").limit(500).get();
  const counts: Record<string, number> = {};
  tenants.docs.forEach((document) => { const state = String(document.data().lifecycleState ?? "UNKNOWN"); counts[state] = (counts[state] ?? 0) + 1; });
  const periodKey = new Date().toISOString().slice(0, 13);
  await db.collection("commercialOperationalMetrics").doc(periodKey).set({ id: periodKey, periodKey, tenantCount: tenants.size, lifecycleCounts: counts, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  logger.info("Commercial operations snapshot", { tenants: tenants.size, lifecycleCounts: counts });
});

export const runScheduledOperationalRetention = onSchedule("every day 02:45", async () => {
  const retentionDays = Math.max(30, Number(process.env.OPERATIONS_ANALYTICS_RETENTION_DAYS ?? 180));
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const snapshot = await db.collection("operationalAnalyticsEvents").where("createdAt", "<=", cutoff).limit(400).get();
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  if (!snapshot.empty) await batch.commit();
  await db.collection("operationalRetentionRuns").add({ id: randomUUID(), workspaceId: process.env.DEFAULT_WORKSPACE_ID ?? "source-it-services", retentionDays, deleted: snapshot.size, status: "SUCCESS", completedAt: FieldValue.serverTimestamp() });
  logger.info("Operational analytics retention sweep", { deleted: snapshot.size, retentionDays });
});
