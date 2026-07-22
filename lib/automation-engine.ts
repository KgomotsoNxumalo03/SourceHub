import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { hasPermission, type CurrentUser } from "@/lib/permissions";
import { actionRegistry, dryRunWorkflow, evaluateConditionTree, redactAutomationData, registryEntryFor, validateWorkflowDefinition, type AutomationDefinition, type AutomationStatus, type ExecutionStatus } from "@/lib/automation-core";

export const automationWorkspaceId = env.DEFAULT_WORKSPACE_ID;

function id(prefix: string) { return `${prefix}_${randomUUID().replaceAll("-", "")}`; }
function now() { return new Date(); }
function fail(message: string): never { throw new Error(message); }

function requirePermission(actor: CurrentUser, permission: string) {
  if (!hasPermission(actor, permission)) fail(`Missing permission: ${permission}`);
}

function parseDefinition(value: unknown): AutomationDefinition {
  const definition = typeof value === "string" ? JSON.parse(value) : value;
  const errors = validateWorkflowDefinition(definition, { maxSteps: env.AUTOMATION_MAX_STEPS, maxConditionDepth: env.AUTOMATION_MAX_CONDITION_DEPTH });
  if (errors.length) fail(errors.join(" "));
  return definition as AutomationDefinition;
}

function safeWorkflow(document: FirebaseFirestore.DocumentSnapshot) {
  return { id: document.id, ...(document.data() ?? {}) } as Record<string, any>;
}

async function getWorkflow(workflowId: string) {
  const document = await firestoreAdmin.collection(collectionNames.automationWorkflows).doc(workflowId).get();
  const workflow = document.exists ? safeWorkflow(document) : null;
  return workflow?.workspaceId === automationWorkspaceId ? workflow : null;
}

async function getVersion(workflowId: string, version: number, kind: "draft" | "published" = "published") {
  const documentId = kind === "draft" ? `${workflowId}:draft:${version}` : `${workflowId}:v:${version}`;
  const document = await firestoreAdmin.collection(collectionNames.automationVersions).doc(documentId).get();
  const versionDocument = document.exists ? safeWorkflow(document) : null;
  return versionDocument?.workspaceId === automationWorkspaceId ? versionDocument : null;
}

export async function createAutomationDraft({ actor, name, description, module, definition }: { actor: CurrentUser; name: string; description: string; module: string; definition: unknown }) {
  requirePermission(actor, "automations.create");
  if (!env.AUTOMATION_ENABLED || env.AUTOMATION_EMERGENCY_DISABLED) fail("Automation creation is currently disabled.");
  const parsed = parseDefinition(definition);
  const trigger = parsed.trigger.key;
  const workflowId = id("auto");
  const versionId = `${workflowId}:draft:1`;
  const timestamp = now();
  await firestoreAdmin.collection(collectionNames.automationWorkflows).doc(workflowId).create({ id: workflowId, workspaceId: automationWorkspaceId, reference: `AUT-${timestamp.getTime().toString(36).toUpperCase()}`, name: name.trim(), description: description.trim() || null, module, triggerKey: trigger, ownerId: actor.id, status: "DRAFT", version: 1, draftVersion: 1, publishedVersion: null, activeVersion: null, active: false, testMode: Boolean(parsed.testMode), failureCount: 0, createdBy: actor.id, createdAt: timestamp, updatedAt: timestamp, publishedAt: null, lastExecutedAt: null });
  await firestoreAdmin.collection(collectionNames.automationVersions).doc(versionId).create({ id: versionId, workspaceId: automationWorkspaceId, workflowId, version: 1, kind: "DRAFT", definition: parsed, createdBy: actor.id, createdAt: timestamp, updatedAt: timestamp, publishedAt: null, immutable: false });
  await logAudit({ userId: actor.id, action: "automation.workflow.create", entityType: "AutomationWorkflow", entityId: workflowId, newValues: { name, module, trigger }, metadata: { version: 1 } });
  return workflowId;
}

export async function updateAutomationDraft({ actor, workflowId, name, description, module, definition }: { actor: CurrentUser; workflowId: string; name: string; description: string; module: string; definition: unknown }) {
  requirePermission(actor, "automations.update");
  const workflow = await getWorkflow(workflowId);
  if (!workflow) fail("Workflow not found.");
  if (workflow.status === "ARCHIVED") fail("Archived workflows cannot be edited.");
  const parsed = parseDefinition(definition);
  const version = Number(workflow.draftVersion ?? workflow.version ?? 0) + 1;
  const timestamp = now();
  await firestoreAdmin.collection(collectionNames.automationWorkflows).doc(workflowId).update({ name: name.trim(), description: description.trim() || null, module, triggerKey: parsed.trigger.key, status: workflow.active ? "DRAFT" : workflow.status === "PUBLISHED" ? "DRAFT" : workflow.status, draftVersion: version, version, updatedBy: actor.id, updatedAt: timestamp });
  await firestoreAdmin.collection(collectionNames.automationVersions).doc(`${workflowId}:draft:${version}`).create({ id: `${workflowId}:draft:${version}`, workspaceId: automationWorkspaceId, workflowId, version, kind: "DRAFT", definition: parsed, createdBy: actor.id, createdAt: timestamp, updatedAt: timestamp, publishedAt: null, immutable: false });
  await logAudit({ userId: actor.id, action: "automation.workflow.update", entityType: "AutomationWorkflow", entityId: workflowId, metadata: { version, activePublishedVersion: workflow.activeVersion ?? null } });
  return workflowId;
}

export async function publishAutomationWorkflow(actor: CurrentUser, workflowId: string) {
  requirePermission(actor, "automations.publish");
  const workflow = await getWorkflow(workflowId);
  if (!workflow) fail("Workflow not found.");
  const draftVersion = Number(workflow.draftVersion ?? workflow.version ?? 0);
  const draft = await getVersion(workflowId, draftVersion, "draft");
  if (!draft) fail("Create a valid draft before publishing.");
  const definition = parseDefinition(draft.definition);
  const publishedVersion = Number(workflow.publishedVersion ?? 0) + 1;
  const timestamp = now();
  const versionId = `${workflowId}:v:${publishedVersion}`;
  await firestoreAdmin.collection(collectionNames.automationVersions).doc(versionId).create({ id: versionId, workspaceId: automationWorkspaceId, workflowId, version: publishedVersion, kind: "PUBLISHED", definition, createdBy: actor.id, createdAt: timestamp, updatedAt: timestamp, publishedAt: timestamp, immutable: true });
  await firestoreAdmin.collection(collectionNames.automationWorkflows).doc(workflowId).update({ status: workflow.active ? "ACTIVE" : "PUBLISHED", publishedVersion, publishedAt: timestamp, updatedAt: timestamp, updatedBy: actor.id });
  await logAudit({ userId: actor.id, action: "automation.workflow.publish", entityType: "AutomationWorkflow", entityId: workflowId, metadata: { version: publishedVersion, activeVersion: workflow.activeVersion ?? null } });
  return publishedVersion;
}

export async function setAutomationState(actor: CurrentUser, workflowId: string, state: "ACTIVE" | "PAUSED" | "ARCHIVED", reason = "") {
  const permission = state === "ACTIVE" ? "automations.activate" : state === "PAUSED" ? "automations.pause" : "automations.archive";
  requirePermission(actor, permission);
  const workflow = await getWorkflow(workflowId);
  if (!workflow) fail("Workflow not found.");
  if (state === "ACTIVE" && !workflow.publishedVersion) fail("Publish a workflow version before activating it.");
  if (state === "ARCHIVED" && workflow.active) fail("Pause an active workflow before archiving it.");
  const timestamp = now();
  await firestoreAdmin.collection(collectionNames.automationWorkflows).doc(workflowId).update({ status: state, active: state === "ACTIVE", activeVersion: state === "ACTIVE" ? workflow.publishedVersion : null, updatedAt: timestamp, updatedBy: actor.id, ...(state === "PAUSED" ? { pauseReason: reason.trim() || "Paused by an authorised user." } : {}) });
  const activityId = id("activity");
  await firestoreAdmin.collection(collectionNames.automationActivities).doc(activityId).create({ id: activityId, workspaceId: automationWorkspaceId, workflowId, action: `workflow.${state.toLowerCase()}`, actorId: actor.id, reason: reason.trim() || null, createdAt: timestamp });
  await logAudit({ userId: actor.id, action: `automation.workflow.${state.toLowerCase()}`, entityType: "AutomationWorkflow", entityId: workflowId, metadata: { reason: reason.trim() || null } });
}

export async function rollbackAutomationWorkflow(actor: CurrentUser, workflowId: string, sourceVersion: number) {
  requirePermission(actor, "automations.publish");
  const workflow = await getWorkflow(workflowId);
  const source = await getVersion(workflowId, sourceVersion, "published");
  if (!workflow || !source) fail("Published workflow version not found.");
  const version = Number(workflow.publishedVersion ?? 0) + 1;
  const timestamp = now();
  await firestoreAdmin.collection(collectionNames.automationVersions).doc(`${workflowId}:v:${version}`).create({ id: `${workflowId}:v:${version}`, workspaceId: automationWorkspaceId, workflowId, version, kind: "PUBLISHED", definition: parseDefinition(source.definition), createdBy: actor.id, createdAt: timestamp, updatedAt: timestamp, publishedAt: timestamp, rollbackOfVersion: sourceVersion, immutable: true });
  await firestoreAdmin.collection(collectionNames.automationWorkflows).doc(workflowId).update({ publishedVersion: version, publishedAt: timestamp, status: workflow.active ? "ACTIVE" : "PUBLISHED", updatedAt: timestamp, updatedBy: actor.id });
  await logAudit({ userId: actor.id, action: "automation.workflow.rollback", entityType: "AutomationWorkflow", entityId: workflowId, metadata: { sourceVersion, version } });
  return version;
}

export async function listAutomationWorkflows() {
  const snapshot = await firestoreAdmin.collection(collectionNames.automationWorkflows).where("workspaceId", "==", automationWorkspaceId).orderBy("updatedAt", "desc").limit(100).get().catch(() => firestoreAdmin.collection(collectionNames.automationWorkflows).where("workspaceId", "==", automationWorkspaceId).limit(100).get());
  return snapshot.docs.map(safeWorkflow);
}

export async function getAutomationDetail(workflowId: string) {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return null;
  const versions = await firestoreAdmin.collection(collectionNames.automationVersions).where("workspaceId", "==", automationWorkspaceId).where("workflowId", "==", workflowId).limit(100).get();
  return { workflow, versions: versions.docs.map(safeWorkflow).sort((left, right) => Number(right.version) - Number(left.version)) };
}

export async function testAutomationWorkflow(actor: CurrentUser, workflowId: string, context: Record<string, unknown>) {
  requirePermission(actor, "automations.review");
  const workflow = await getWorkflow(workflowId);
  if (!workflow) fail("Workflow not found.");
  const version = await getVersion(workflowId, Number(workflow.draftVersion ?? 1), "draft");
  if (!version) fail("Draft version not found.");
  const definition = parseDefinition(version.definition);
  return dryRunWorkflow(definition, { ...context, trigger: { ...(context.trigger as Record<string, unknown> | undefined), workspaceId: automationWorkspaceId }, actor: { id: actor.id, email: actor.email } });
}

function idempotencyDocumentId(workflowId: string, eventId: string) { return `${automationWorkspaceId}:${workflowId}:${eventId}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 500); }

export async function ingestAutomationEvent({ eventId, triggerKey, payload, actorId = null, correlationId = eventId, causationId = null, dryRun = false }: { eventId: string; triggerKey: string; payload: Record<string, unknown>; actorId?: string | null; correlationId?: string; causationId?: string | null; dryRun?: boolean }) {
  if (!env.AUTOMATION_ENABLED || env.AUTOMATION_EMERGENCY_DISABLED) return { matched: 0, queued: 0, skipped: "disabled" };
  const workflows = (await listAutomationWorkflows()).filter((workflow) => workflow.active && workflow.triggerKey === triggerKey && workflow.activeVersion);
  let queued = 0;
  for (const workflow of workflows) {
    const definitionDocument = await getVersion(workflow.id, Number(workflow.activeVersion), "published");
    if (!definitionDocument) continue;
    const definition = parseDefinition(definitionDocument.definition);
    const context = { trigger: { ...payload, eventType: triggerKey, workspaceId: automationWorkspaceId }, previous: payload.previous ?? {}, new: payload.new ?? {}, metadata: payload.metadata ?? {} };
    if (!evaluateConditionTree(definition.trigger.conditions, context)) continue;
    if (dryRun) continue;
    const idemId = idempotencyDocumentId(workflow.id, eventId);
    const idemRef = firestoreAdmin.collection(collectionNames.automationIdempotency).doc(idemId);
    const claimed = await firestoreAdmin.runTransaction(async (transaction) => {
      const existing = await transaction.get(idemRef);
      if (existing.exists) return false;
      transaction.create(idemRef, { id: idemId, workspaceId: automationWorkspaceId, workflowId: workflow.id, triggerEventId: eventId, status: "CLAIMED", expiresAt: new Date(Date.now() + env.AUTOMATION_IDEMPOTENCY_RETENTION_DAYS * 86400000), createdAt: now(), updatedAt: now() });
      return true;
    });
    if (!claimed) continue;
    const executionId = id("execution");
    await firestoreAdmin.collection(collectionNames.automationExecutions).doc(executionId).create({ id: executionId, workspaceId: automationWorkspaceId, workflowId: workflow.id, workflowVersion: workflow.activeVersion, triggerKey, triggerEventId: eventId, actorId, currentStep: 0, status: "QUEUED", input: redactAutomationData(payload), stepResults: [], retryCount: 0, parentExecutionId: null, childExecutionIds: [], correlationId, causationId, idempotencyKey: idemId, createdAt: now(), updatedAt: now(), startedAt: null, completedAt: null, nextExecutionAt: null, error: null, testMode: false });
    await idemRef.update({ executionId, status: "QUEUED", updatedAt: now() });
    queued += 1;
  }
  return { matched: workflows.length, queued };
}

async function executeAction(action: string, config: Record<string, unknown>, execution: Record<string, any>) {
  const entry = registryEntryFor(actionRegistry, action);
  if (!entry) fail("Action is not approved.");
  if (action === "create_in_app_notification" || action === "notify_user" || action === "notify_manager" || action === "notify_team") {
    const recipientId = String(config.userId ?? execution.actorId ?? "");
    const recipient = recipientId ? await firestoreAdmin.collection(collectionNames.users).doc(recipientId).get() : null;
    if (!recipient?.exists || recipient.data()?.workspaceId !== automationWorkspaceId) fail("Notification recipient is outside the workspace.");
    const notificationId = id("notification");
    await firestoreAdmin.collection(collectionNames.notifications).doc(notificationId).create({ id: notificationId, workspaceId: automationWorkspaceId, userId: recipientId, type: "AUTOMATION", title: String(config.title ?? "SourceHub automation"), message: String(config.message ?? "An automation requires your attention.").slice(0, 2000), link: typeof config.link === "string" ? config.link.slice(0, 500) : null, readAt: null, createdAt: now() });
    return { notificationId, delivered: true };
  }
  if (action === "prepare_email_draft") {
    const draftId = id("email_draft");
    await firestoreAdmin.collection(collectionNames.emailMessages).doc(draftId).create({ id: draftId, workspaceId: automationWorkspaceId, direction: "OUTBOUND", processingStatus: "DRAFT", to: Array.isArray(config.recipients) ? config.recipients.slice(0, env.AUTOMATION_WEBHOOK_MAX_RECIPIENTS) : [], subject: String(config.subject ?? "SourceHub automation draft").slice(0, 200), bodyText: String(config.body ?? "").slice(0, 10000), sourceExecutionId: execution.id, createdAt: now(), updatedAt: now() });
    return { draftId, delivered: false, reviewRequired: true };
  }
  if (action === "stop_workflow") return { stopped: true };
  fail(`Action '${entry.label}' requires a configured trusted provider and was not executed.`);
}

export async function runAutomationExecution(executionId: string) {
  const executionDocument = await firestoreAdmin.collection(collectionNames.automationExecutions).doc(executionId).get();
  if (!executionDocument.exists) fail("Execution not found.");
  const execution = safeWorkflow(executionDocument);
  if (execution.workspaceId !== automationWorkspaceId || ["COMPLETED", "CANCELLED", "DEAD_LETTER"].includes(execution.status)) return execution;
  const workflow = await getWorkflow(execution.workflowId);
  const version = workflow ? await getVersion(workflow.id, Number(execution.workflowVersion), "published") : null;
  if (!workflow || !version) fail("The immutable workflow version is unavailable.");
  const definition = parseDefinition(version.definition);
  await executionDocument.ref.update({ status: "RUNNING", startedAt: execution.startedAt ?? now(), updatedAt: now(), error: null });
  const context = { trigger: execution.input ?? {}, previous: execution.input?.previous ?? {}, new: execution.input?.new ?? {}, metadata: execution.input?.metadata ?? {}, actor: { id: execution.actorId } };
  for (let index = Number(execution.currentStep ?? 0); index < definition.steps.length; index += 1) {
    const step = definition.steps[index];
    if (!step.enabled) continue;
    await executionDocument.ref.update({ currentStep: index, updatedAt: now() });
    if (!evaluateConditionTree(step.conditions, context)) {
      await firestoreAdmin.collection(collectionNames.automationStepExecutions).doc(`${executionId}:${step.id}`).set({ id: `${executionId}:${step.id}`, workspaceId: automationWorkspaceId, executionId, workflowId: workflow.id, workflowVersion: execution.workflowVersion, stepId: step.id, status: "SKIPPED", input: {}, output: {}, createdAt: now(), updatedAt: now() }, { merge: true });
      continue;
    }
    const action = step.action ?? step.type;
    const entry = registryEntryFor(actionRegistry, action);
    if (entry?.highRisk || step.type === "approval") {
      const approvalId = `${executionId}:${step.id}`;
      const approvalRef = firestoreAdmin.collection(collectionNames.automationApprovals).doc(approvalId);
      const existingApproval = await approvalRef.get();
      if (!existingApproval.exists) await approvalRef.create({ id: approvalId, workspaceId: automationWorkspaceId, workflowId: workflow.id, workflowVersion: execution.workflowVersion, executionId, stepId: step.id, requesterId: execution.actorId, approverRole: String(step.config.approverRole ?? ""), approverTeamId: String(step.config.approverTeamId ?? ""), reason: String(step.config.reason ?? `Approval required for ${step.name}`), requestedAction: action, actionPayload: redactAutomationData(step.config), affectedRecords: redactAutomationData(execution.input), status: "PENDING", deadlineAt: new Date(Date.now() + 48 * 3600000), decision: null, decisionReason: null, createdAt: now(), decidedAt: null, updatedAt: now() });
      await executionDocument.ref.update({ status: "WAITING_FOR_APPROVAL", updatedAt: now(), currentStep: index, nextExecutionAt: null });
      return { ...execution, status: "WAITING_FOR_APPROVAL", currentStep: index };
    }
    if (action === "delay" || action === "wait_until" || step.type === "delay") {
      const delaySeconds = Math.min(Math.max(Number(step.config.seconds ?? 60), 1), 30 * 86400);
      const nextExecutionAt = new Date(Date.now() + delaySeconds * 1000);
      await executionDocument.ref.update({ status: "WAITING", updatedAt: now(), currentStep: index + 1, nextExecutionAt });
      await firestoreAdmin.collection(collectionNames.automationSchedules).doc(executionId).set({ id: executionId, workspaceId: automationWorkspaceId, executionId, workflowId: workflow.id, nextExecutionAt, status: "WAITING", createdAt: now(), updatedAt: now() }, { merge: true });
      return { ...execution, status: "WAITING", nextExecutionAt };
    }
    const stepRef = firestoreAdmin.collection(collectionNames.automationStepExecutions).doc(`${executionId}:${step.id}`);
    try {
      const output = await executeAction(action, step.config, execution);
      await stepRef.set({ id: `${executionId}:${step.id}`, workspaceId: automationWorkspaceId, executionId, workflowId: workflow.id, workflowVersion: execution.workflowVersion, stepId: step.id, action, status: "COMPLETED", input: redactAutomationData(step.config), output: redactAutomationData(output), retryCount: 0, createdAt: now(), updatedAt: now() }, { merge: true });
    } catch (error: any) {
      const retryCount = Number(execution.retryCount ?? 0) + 1;
      const retryAllowed = step.onError === "retry" && retryCount <= Math.min(Number(definition.retryPolicy?.maxAttempts ?? env.AUTOMATION_MAX_RETRIES), env.AUTOMATION_MAX_RETRIES);
      const message = String(error?.message ?? "Automation action failed").slice(0, 1000);
      await stepRef.set({ id: `${executionId}:${step.id}`, workspaceId: automationWorkspaceId, executionId, workflowId: workflow.id, workflowVersion: execution.workflowVersion, stepId: step.id, action, status: retryAllowed ? "RETRYING" : "FAILED", input: redactAutomationData(step.config), output: null, error: message, retryCount, createdAt: now(), updatedAt: now() }, { merge: true });
      if (retryAllowed) {
        const nextExecutionAt = new Date(Date.now() + Math.min(300, 2 ** retryCount * Number(definition.retryPolicy?.initialDelaySeconds ?? 5)) * 1000);
        await executionDocument.ref.update({ status: "RETRYING", retryCount, nextExecutionAt, updatedAt: now(), error: message });
        return { ...execution, status: "RETRYING", nextExecutionAt };
      }
      await executionDocument.ref.update({ status: "DEAD_LETTER", retryCount, completedAt: now(), updatedAt: now(), error: message });
      await firestoreAdmin.collection(collectionNames.automationDeadLetters).doc(executionId).set({ id: executionId, workspaceId: automationWorkspaceId, executionId, workflowId: workflow.id, workflowVersion: execution.workflowVersion, reason: message, status: "OPEN", createdAt: now(), updatedAt: now() });
      await maybePauseWorkflow(workflow, message);
      return { ...execution, status: "DEAD_LETTER", error: message };
    }
  }
  await executionDocument.ref.update({ status: "COMPLETED", currentStep: definition.steps.length, completedAt: now(), updatedAt: now(), nextExecutionAt: null });
  await firestoreAdmin.collection(collectionNames.automationWorkflows).doc(workflow.id).update({ lastExecutedAt: now(), failureCount: 0, updatedAt: now() });
  return { ...execution, status: "COMPLETED" };
}

async function maybePauseWorkflow(workflow: Record<string, any>, reason: string) {
  const failureCount = Number(workflow.failureCount ?? 0) + 1;
  const update: Record<string, unknown> = { failureCount, updatedAt: now() };
  if (failureCount >= 3) { update.status = "PAUSED"; update.active = false; update.activeVersion = null; update.pauseReason = `Automatically paused after repeated failures: ${reason}`; }
  await firestoreAdmin.collection(collectionNames.automationWorkflows).doc(workflow.id).update(update);
}

export async function processDueAutomationExecutions(limit = 50) {
  const snapshot = await firestoreAdmin.collection(collectionNames.automationExecutions).where("workspaceId", "==", automationWorkspaceId).where("status", "in", ["QUEUED", "WAITING", "RETRYING"]).limit(limit).get();
  let processed = 0;
  for (const document of snapshot.docs) {
    const data = document.data();
    if (data.status !== "QUEUED" && data.nextExecutionAt?.toDate && data.nextExecutionAt.toDate() > now()) continue;
    await runAutomationExecution(document.id).catch(() => undefined);
    processed += 1;
  }
  return processed;
}

export async function getAutomationDashboard() {
  const [workflows, executions, approvals] = await Promise.all([
    firestoreAdmin.collection(collectionNames.automationWorkflows).where("workspaceId", "==", automationWorkspaceId).limit(200).get(),
    firestoreAdmin.collection(collectionNames.automationExecutions).where("workspaceId", "==", automationWorkspaceId).orderBy("createdAt", "desc").limit(100).get().catch(() => firestoreAdmin.collection(collectionNames.automationExecutions).where("workspaceId", "==", automationWorkspaceId).limit(100).get()),
    firestoreAdmin.collection(collectionNames.automationApprovals).where("workspaceId", "==", automationWorkspaceId).where("status", "==", "PENDING").limit(100).get(),
  ]);
  const items = executions.docs.map(safeWorkflow);
  const success = items.filter((item) => item.status === "COMPLETED").length;
  const failed = items.filter((item) => ["FAILED", "DEAD_LETTER", "TIMED_OUT"].includes(item.status)).length;
  return { counts: { active: workflows.docs.filter((doc) => doc.data().active).length, paused: workflows.docs.filter((doc) => doc.data().status === "PAUSED").length, failedWorkflows: workflows.docs.filter((doc) => doc.data().status === "ERROR").length, executionsToday: items.length, successfulExecutions: success, failedExecutions: failed, waitingExecutions: items.filter((item) => ["WAITING", "WAITING_FOR_APPROVAL"].includes(item.status)).length, pendingApprovals: approvals.size, deadLetterExecutions: items.filter((item) => item.status === "DEAD_LETTER").length }, workflows: workflows.docs.map(safeWorkflow), recentExecutions: items, approvals: approvals.docs.map(safeWorkflow) };
}

export async function getAutomationExecution(executionId: string) {
  const document = await firestoreAdmin.collection(collectionNames.automationExecutions).doc(executionId).get();
  if (!document.exists || document.data()?.workspaceId !== automationWorkspaceId) return null;
  const execution = safeWorkflow(document);
  const [steps, approvals] = await Promise.all([
    firestoreAdmin.collection(collectionNames.automationStepExecutions).where("workspaceId", "==", automationWorkspaceId).where("executionId", "==", executionId).limit(100).get(),
    firestoreAdmin.collection(collectionNames.automationApprovals).where("workspaceId", "==", automationWorkspaceId).where("executionId", "==", executionId).limit(20).get(),
  ]);
  return { execution: { ...execution, input: redactAutomationData(execution.input), error: execution.error ? String(execution.error) : null }, steps: steps.docs.map((step) => ({ ...safeWorkflow(step), input: redactAutomationData(step.data().input), output: redactAutomationData(step.data().output) })), approvals: approvals.docs.map(safeWorkflow) };
}

export async function decideAutomationApproval(actor: CurrentUser, approvalId: string, decision: "APPROVED" | "REJECTED", reason: string) {
  requirePermission(actor, "automations.approve");
  if (decision === "APPROVED") requirePermission(actor, "automations.high_risk.approve");
  const approvalRef = firestoreAdmin.collection(collectionNames.automationApprovals).doc(approvalId);
  const approvalDocument = await approvalRef.get();
  const approval = approvalDocument.exists ? safeWorkflow(approvalDocument) : null;
  if (!approval || approval.workspaceId !== automationWorkspaceId || approval.status !== "PENDING") fail("Approval is no longer pending.");
  if (approval.requesterId === actor.id) fail("Self-approval is not allowed.");
  if (approval.deadlineAt?.toDate && approval.deadlineAt.toDate() < now()) { await approvalRef.update({ status: "EXPIRED", updatedAt: now() }); fail("Approval has expired."); }
  await firestoreAdmin.runTransaction(async (transaction) => {
    const latest = await transaction.get(approvalRef);
    if (!latest.exists || latest.data()?.status !== "PENDING") fail("Approval was already decided.");
    transaction.update(approvalRef, { status: decision, decision, decisionReason: reason.trim() || null, decidedBy: actor.id, decidedAt: now(), updatedAt: now() });
    transaction.update(firestoreAdmin.collection(collectionNames.automationExecutions).doc(approval.executionId), { status: decision === "APPROVED" ? "QUEUED" : "FAILED", error: decision === "REJECTED" ? "Approval rejected." : null, updatedAt: now(), ...(decision === "REJECTED" ? { completedAt: now() } : {}) });
  });
  await logAudit({ userId: actor.id, action: `automation.approval.${decision.toLowerCase()}`, entityType: "AutomationApproval", entityId: approvalId, metadata: { executionId: approval.executionId, reason: reason.trim() || null } });
}

export async function updateAutomationExecution(actor: CurrentUser, executionId: string, operation: "cancel" | "retry" | "retry_from_beginning" | "dead_letter" | "mark_reviewed") {
  const permissions: Record<string, string> = { cancel: "automations.cancel", retry: "automations.retry", retry_from_beginning: "automations.retry", dead_letter: "automations.audit.view", mark_reviewed: "automations.audit.view" };
  requirePermission(actor, permissions[operation]);
  const reference = firestoreAdmin.collection(collectionNames.automationExecutions).doc(executionId);
  const document = await reference.get();
  if (!document.exists || document.data()?.workspaceId !== automationWorkspaceId) fail("Execution not found.");
  const update: Record<string, unknown> = { updatedAt: now() };
  if (operation === "cancel") { update.status = "CANCELLED"; update.completedAt = now(); }
  if (operation === "retry" || operation === "retry_from_beginning") { update.status = "QUEUED"; update.error = null; update.nextExecutionAt = null; if (operation === "retry_from_beginning") update.currentStep = 0; }
  if (operation === "dead_letter") { update.status = "DEAD_LETTER"; update.completedAt = now(); }
  if (operation === "mark_reviewed") update.reviewedAt = now();
  await reference.update(update);
  await logAudit({ userId: actor.id, action: `automation.execution.${operation}`, entityType: "AutomationExecution", entityId: executionId });
}
