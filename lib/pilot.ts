import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { env } from "@/lib/env";
import { recordEnterpriseAudit } from "@/lib/enterprise";
import { defaultPilotChecklist, pilotDecisionSchema, pilotProgramSchema, pilotStatuses, pilotChecklistItemSchema, uatResultSchema, type PilotStatus } from "@/lib/pilot-core";
import type { CurrentUser } from "@/lib/permissions";

const scope = (actor: CurrentUser) => actor.workspaceId ?? env.DEFAULT_WORKSPACE_ID;
const toPlain = (value: unknown): unknown => value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate() : value;
const documentData = (document: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): Record<string, any> => ({ id: document.id, ...Object.fromEntries(Object.entries(document.data() ?? {}).map(([key, value]) => [key, toPlain(value)])) });
const safeList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30);

const scenarioSeed = [
  ["service-desk", "Service Desk lifecycle", "service-desk", "Create, triage, assign, resolve, and confirm a ticket without duplication."],
  ["asset-management", "Asset handover", "assets", "Create an asset, assign it, transfer it, and verify immutable history."],
  ["attendance", "Attendance exception", "attendance", "Complete a legitimate check-in and review an exception with the correct permission."],
  ["projects", "Project delivery", "projects", "Create a project, assign tasks, record time, and validate progress."],
  ["finance", "Finance review", "finance", "Review an approved finance record, validate minor-unit totals, and inspect audit history."],
  ["knowledge-ai", "Knowledge and AI safety", "knowledge", "Retrieve permitted knowledge and reject prompt injection or high-risk action without confirmation."],
  ["automation", "Automation idempotency", "automations", "Trigger an approved workflow once and verify a retry does not duplicate its result."],
  ["tenant-isolation", "Tenant isolation", "security", "Verify that similar synthetic tenants cannot read, write, search, export, or execute across scope."],
] as const;

async function scopedDocument(collection: string, id: string, workspaceId: string) {
  const document = await firestoreAdmin.collection(collection).doc(id).get();
  if (!document.exists || document.data()?.workspaceId !== workspaceId) throw new Error("The requested pilot record is not available in this workspace.");
  return document;
}

export async function listPilots(actor: CurrentUser) {
  if (!env.PILOT_ENABLED) return [];
  const snapshot = await firestoreAdmin.collection(collectionNames.pilotPrograms).where("workspaceId", "==", scope(actor)).limit(100).get();
  return snapshot.docs.map(documentData).sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
}

export async function getPilotDetail(id: string, actor: CurrentUser) {
  const workspaceId = scope(actor);
  const pilot = await scopedDocument(collectionNames.pilotPrograms, id, workspaceId);
  const [checklist, cases, risks, checkpoints, decisions, training] = await Promise.all([
    firestoreAdmin.collection(collectionNames.pilotChecklistItems).where("pilotId", "==", id).where("workspaceId", "==", workspaceId).limit(100).get(),
    firestoreAdmin.collection(collectionNames.pilotUatCases).where("pilotId", "==", id).where("workspaceId", "==", workspaceId).limit(100).get(),
    firestoreAdmin.collection(collectionNames.pilotRisks).where("pilotId", "==", id).where("workspaceId", "==", workspaceId).limit(100).get(),
    firestoreAdmin.collection(collectionNames.pilotCheckpoints).where("pilotId", "==", id).where("workspaceId", "==", workspaceId).limit(100).get(),
    firestoreAdmin.collection(collectionNames.pilotDecisions).where("pilotId", "==", id).where("workspaceId", "==", workspaceId).limit(20).get(),
    firestoreAdmin.collection(collectionNames.pilotTraining).where("pilotId", "==", id).where("workspaceId", "==", workspaceId).limit(100).get(),
  ]);
  return { pilot: documentData(pilot), checklist: checklist.docs.map(documentData), cases: cases.docs.map(documentData), risks: risks.docs.map(documentData), checkpoints: checkpoints.docs.map(documentData), decisions: decisions.docs.map(documentData), training: training.docs.map(documentData) };
}

export async function createPilot(input: unknown, actor: CurrentUser) {
  if (!env.PILOT_ENABLED) throw new Error("Pilot management is disabled by configuration.");
  const workspaceId = scope(actor);
  const value = pilotProgramSchema.parse(input);
  if (value.participatingWorkspaceId !== workspaceId) throw new Error("A pilot must remain inside the current workspace scope.");
  if (value.participantUserIds.length > env.PILOT_MAX_PARTICIPANTS) throw new Error("The pilot exceeds the configured participant limit.");
  const pilotId = randomUUID();
  const batch = firestoreAdmin.batch();
  const pilotRef = firestoreAdmin.collection(collectionNames.pilotPrograms).doc(pilotId);
  batch.set(pilotRef, { id: pilotId, ...value, workspaceId, tenantId: workspaceId, status: "DRAFT", synthetic: false, commercialModeActivated: false, trainingStatus: "NOT_STARTED", createdBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  for (const [index, title] of defaultPilotChecklist.entries()) {
    const id = `${pilotId}:checklist:${index + 1}`;
    batch.set(firestoreAdmin.collection(collectionNames.pilotChecklistItems).doc(id), { id, pilotId, workspaceId, tenantId: workspaceId, title, status: "PENDING", ownerId: "", dueDate: null, notes: "", evidence: "", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
  for (const [key, title, module, expected] of scenarioSeed) {
    const id = `${pilotId}:uat:${key}`;
    batch.set(firestoreAdmin.collection(collectionNames.pilotUatCases).doc(id), { id, pilotId, workspaceId, tenantId: workspaceId, scenarioKey: key, title, persona: key === "service-desk" ? "Service desk manager" : "Platform administrator", module, preconditions: "Approved pilot workspace and assigned participant.", steps: [`Open the ${module} workflow.`, "Complete only the authorised, non-destructive steps.", "Record evidence and the observed outcome."], expectedResult: expected, assignedTesterId: "", status: "NOT_RUN", signOffStatus: "PENDING", synthetic: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId, action: "pilot.created", targetType: "PilotProgram", targetId: pilotId, metadata: { status: "DRAFT", participatingWorkspaceId: workspaceId, commercialModeActivated: false } });
  return pilotId;
}

export async function updatePilotStatus(id: string, status: PilotStatus, actor: CurrentUser, confirmation = "") {
  const workspaceId = scope(actor);
  await scopedDocument(collectionNames.pilotPrograms, id, workspaceId);
  if (!pilotStatuses.includes(status)) throw new Error("The pilot status is invalid.");
  if (["APPROVED", "ACTIVE", "COMPLETED", "CANCELLED"].includes(status) && confirmation !== "CONFIRM_PILOT_CHANGE") throw new Error("This high-risk pilot change requires explicit confirmation.");
  await firestoreAdmin.collection(collectionNames.pilotPrograms).doc(id).update({ status, updatedBy: actor.id, updatedAt: FieldValue.serverTimestamp(), commercialModeActivated: false });
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId, action: "pilot.status.changed", targetType: "PilotProgram", targetId: id, metadata: { status, commercialModeActivated: false } });
}

export async function updateChecklistItem(id: string, input: unknown, actor: CurrentUser) {
  const value = pilotChecklistItemSchema.parse(input);
  const workspaceId = scope(actor);
  const item = await scopedDocument(collectionNames.pilotChecklistItems, id, workspaceId);
  await scopedDocument(collectionNames.pilotPrograms, String(item.data()?.pilotId ?? ""), workspaceId);
  await item.ref.update({ ...value, completedAt: value.status === "COMPLETE" ? FieldValue.serverTimestamp() : null, updatedBy: actor.id, updatedAt: FieldValue.serverTimestamp() });
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId, action: "pilot.checklist.updated", targetType: "PilotChecklistItem", targetId: id, metadata: { status: value.status } });
}

export async function recordUatResult(id: string, input: unknown, actor: CurrentUser) {
  const value = uatResultSchema.parse(input);
  const workspaceId = scope(actor);
  const item = await scopedDocument(collectionNames.pilotUatCases, id, workspaceId);
  const data = item.data() ?? {};
  await scopedDocument(collectionNames.pilotPrograms, String(data.pilotId ?? ""), workspaceId);
  await item.ref.update({ ...value, signOffStatus: "PENDING", testedBy: actor.id, testedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId, action: "pilot.uat.result.recorded", targetType: "PilotUatCase", targetId: id, metadata: { status: value.status, linkedDefect: Boolean(value.linkedDefectId) } });
}

export async function recordPilotDecision(id: string, input: unknown, actor: CurrentUser) {
  const value = pilotDecisionSchema.parse(input);
  const workspaceId = scope(actor);
  await scopedDocument(collectionNames.pilotPrograms, id, workspaceId);
  const decisionId = `${id}:${Date.now()}`;
  await firestoreAdmin.collection(collectionNames.pilotDecisions).doc(decisionId).set({ id: decisionId, pilotId: id, workspaceId, tenantId: workspaceId, ...value, decidedBy: actor.id, createdAt: FieldValue.serverTimestamp() });
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId, action: "pilot.decision.recorded", targetType: "PilotDecision", targetId: decisionId, metadata: { outcome: value.outcome, rollbackReady: value.rollbackReady, monitoringReady: value.monitoringReady } });
  return decisionId;
}

export async function getPilotDashboard(id: string, actor: CurrentUser) {
  const detail = await getPilotDetail(id, actor);
  const [feedback, analytics, defects, health] = await Promise.all([
    firestoreAdmin.collection(collectionNames.operationalFeedback).where("workspaceId", "==", scope(actor)).where("pilotId", "==", id).limit(100).get(),
    firestoreAdmin.collection(collectionNames.operationalAnalyticsEvents).where("workspaceId", "==", scope(actor)).limit(200).get(),
    firestoreAdmin.collection(collectionNames.operationalDefects).where("workspaceId", "==", scope(actor)).limit(100).get(),
    firestoreAdmin.collection(collectionNames.operationalHealthChecks).where("workspaceId", "==", scope(actor)).limit(100).get(),
  ]);
  const cases = detail.cases as Array<Record<string, any>>;
  const feedbackRows = feedback.docs.map(documentData);
  const defectRows = defects.docs.map(documentData);
  const feedbackByType = Object.fromEntries(["BUG", "USABILITY", "MISSING_CAPABILITY", "PERFORMANCE", "DOCUMENTATION", "TRAINING", "POSITIVE", "GENERAL"].map((type) => [type, feedbackRows.filter((item) => item.feedbackType === type || item.category === type).length]));
  const defectsByPriority = Object.fromEntries(["P0", "P1", "P2", "P3", "P4"].map((priority) => [priority, defectRows.filter((item) => item.priority === priority).length]));
  const pendingChecklist = detail.checklist.filter((item) => item.status !== "COMPLETE").length;
  const recommendedNextAction = String(detail.pilot.status) === "DRAFT" ? "Confirm scope and complete the readiness checklist." : pendingChecklist > 0 ? `Resolve ${pendingChecklist} outstanding readiness item(s).` : cases.some((item) => item.status === "FAIL" || item.status === "BLOCKED") ? "Triage failed or blocked UAT cases before any decision." : "Record human UAT evidence and a separate go/no-go decision.";
  return { ...detail, feedback: feedbackRows, defects: defectRows, health: health.docs.map(documentData), analyticsCount: analytics.size, syntheticAnalyticsCount: analytics.docs.filter((item) => item.data().synthetic === true).length, feedbackByType, defectsByPriority, pendingChecklist, recommendedNextAction, uat: { total: cases.length, passed: cases.filter((item) => item.status === "PASS").length, failed: cases.filter((item) => item.status === "FAIL").length, blocked: cases.filter((item) => item.status === "BLOCKED").length, notRun: cases.filter((item) => item.status === "NOT_RUN").length } };
}

export async function saveTourProgress(actor: CurrentUser, input: { step: number; completed: boolean; dismissed: boolean }) {
  const workspaceId = scope(actor);
  const id = `${workspaceId}:${actor.id}`;
  await firestoreAdmin.collection(collectionNames.pilotTourProgress).doc(id).set({ id, workspaceId, tenantId: workspaceId, userId: actor.id, step: Math.max(0, Math.min(30, Math.trunc(input.step))), completed: Boolean(input.completed), dismissed: Boolean(input.dismissed), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function saveOnboardingProgress(actor: CurrentUser, input: { completedSteps: string[]; currentStep: string }) {
  const workspaceId = scope(actor);
  const id = `${workspaceId}:${actor.id}`;
  await firestoreAdmin.collection(collectionNames.pilotOnboardingProgress).doc(id).set({ id, workspaceId, tenantId: workspaceId, userId: actor.id, completedSteps: safeList(input.completedSteps.join(",")), currentStep: input.currentStep.slice(0, 100), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId, action: "pilot.onboarding.progress.saved", targetType: "PilotOnboardingProgress", targetId: id, metadata: { currentStep: input.currentStep, completedCount: input.completedSteps.length } });
}

export async function getOnboardingProgress(actor: CurrentUser) {
  const id = `${scope(actor)}:${actor.id}`;
  const document = await firestoreAdmin.collection(collectionNames.pilotOnboardingProgress).doc(id).get();
  return document.exists ? documentData(document) : { id, completedSteps: [], currentStep: "welcome" };
}

export async function getTourProgress(actor: CurrentUser) {
  const id = `${scope(actor)}:${actor.id}`;
  const document = await firestoreAdmin.collection(collectionNames.pilotTourProgress).doc(id).get();
  return document.exists ? documentData(document) : { id, step: 0, completed: false, dismissed: false };
}
