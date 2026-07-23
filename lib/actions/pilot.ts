"use server";

import { redirect } from "next/navigation";

import { requireAuth, requirePermission } from "@/lib/auth";
import { createPilot, recordPilotDecision, recordUatResult, saveOnboardingProgress, saveTourProgress, updateChecklistItem, updatePilotStatus } from "@/lib/pilot";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const list = (formData: FormData, key: string) => text(formData, key).split("\n").map((item) => item.trim()).filter(Boolean);

export async function createPilotAction(formData: FormData) {
  const actor = await requirePermission("pilots.manage");
  const id = await createPilot({ name: text(formData, "name"), description: text(formData, "description"), objectives: list(formData, "objectives"), startDate: text(formData, "startDate"), targetEndDate: text(formData, "targetEndDate"), ownerId: actor.id, participantUserIds: list(formData, "participantUserIds"), participantRoles: list(formData, "participantRoles"), enabledModules: list(formData, "enabledModules"), featureFlagIds: list(formData, "featureFlagIds"), successCriteria: list(formData, "successCriteria"), knownLimitations: list(formData, "knownLimitations"), participatingWorkspaceId: actor.workspaceId }, actor);
  redirect(`/administration/pilots/${id}`);
}

export async function updatePilotStatusAction(formData: FormData) {
  const actor = await requirePermission("pilots.manage");
  await updatePilotStatus(text(formData, "pilotId"), text(formData, "status") as never, actor, text(formData, "confirmation"));
  redirect(`/administration/pilots/${text(formData, "pilotId")}`);
}

export async function updatePilotChecklistAction(formData: FormData) {
  const actor = await requirePermission("pilots.manage");
  await updateChecklistItem(text(formData, "checklistId"), { title: text(formData, "title"), status: text(formData, "status"), ownerId: text(formData, "ownerId"), dueDate: text(formData, "dueDate") || undefined, notes: text(formData, "notes"), evidence: text(formData, "evidence") }, actor);
  redirect(`/administration/pilots/${text(formData, "pilotId")}`);
}

export async function recordUatResultAction(formData: FormData) {
  const actor = await requirePermission("pilots.uat.manage");
  await recordUatResult(text(formData, "caseId"), { status: text(formData, "status"), actualResult: text(formData, "actualResult"), evidence: text(formData, "evidence"), comments: text(formData, "comments"), linkedDefectId: text(formData, "linkedDefectId") }, actor);
  redirect(`/administration/pilots/${text(formData, "pilotId")}/uat`);
}

export async function recordPilotDecisionAction(formData: FormData) {
  const actor = await requirePermission("pilots.manage");
  await recordPilotDecision(text(formData, "pilotId"), { outcome: text(formData, "outcome"), decisionMakers: list(formData, "decisionMakers"), evidenceReviewed: list(formData, "evidenceReviewed"), criticalDefects: list(formData, "criticalDefects"), acceptedRisks: list(formData, "acceptedRisks"), outstandingActions: list(formData, "outstandingActions"), rollbackReady: formData.get("rollbackReady") === "on", monitoringReady: formData.get("monitoringReady") === "on", approvalEvidence: text(formData, "approvalEvidence"), conditions: list(formData, "conditions") }, actor);
  redirect(`/administration/pilots/${text(formData, "pilotId")}`);
}

export async function saveTourProgressAction(input: { step: number; completed: boolean; dismissed: boolean }) {
  const actor = await requireAuth();
  await saveTourProgress(actor, input);
}

export async function savePilotOnboardingAction(formData: FormData) {
  const actor = await requireAuth();
  await saveOnboardingProgress(actor, { currentStep: String(formData.get("currentStep") ?? "welcome"), completedSteps: formData.getAll("completedStep").map(String) });
  redirect("/onboarding/pilot");
}
