import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
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
