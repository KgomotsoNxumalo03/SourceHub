"use server";

import { redirect } from "next/navigation";

import { requireAuth, requirePermission } from "@/lib/auth";
import { createDefect, createIncident, createRelease, submitFeedback } from "@/lib/operations";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const list = (formData: FormData, key: string) => text(formData, key).split(",").map((item) => item.trim()).filter(Boolean);

export async function submitFeedbackAction(formData: FormData) {
  const actor = await requireAuth();
  await submitFeedback({ category: text(formData, "category"), feedbackType: text(formData, "feedbackType") || "GENERAL", pilotId: text(formData, "pilotId"), persona: text(formData, "persona"), module: text(formData, "module"), pageRoute: text(formData, "pageRoute"), description: text(formData, "description"), expectedBehaviour: text(formData, "expectedBehaviour"), actualBehaviour: text(formData, "actualBehaviour"), impact: text(formData, "impact"), frequency: text(formData, "frequency"), businessImpact: text(formData, "businessImpact") || "MEDIUM", browserCategory: text(formData, "browserCategory") || "OTHER", screenCategory: text(formData, "screenCategory") || "UNKNOWN", appVersion: text(formData, "appVersion"), visibility: text(formData, "visibility") || "PRIVATE" }, actor);
  redirect("/feedback?submitted=1");
}

export async function createIncidentAction(formData: FormData) {
  const actor = await requirePermission("operations.manage");
  await createIncident({ title: text(formData, "title"), severity: text(formData, "severity"), affectedModules: list(formData, "affectedModules"), summary: text(formData, "summary") }, actor);
  redirect("/administration/operations?created=incident");
}

export async function createDefectAction(formData: FormData) {
  const actor = await requirePermission("operations.manage");
  await createDefect({ title: text(formData, "title"), priority: text(formData, "priority"), environment: text(formData, "environment"), reproduction: text(formData, "reproduction"), expected: text(formData, "expected"), actual: text(formData, "actual"), workaround: text(formData, "workaround") }, actor);
  redirect("/administration/operations?created=defect");
}

export async function createReleaseAction(formData: FormData) {
  const actor = await requirePermission("operations.manage");
  await createRelease({ version: text(formData, "version"), releaseType: text(formData, "releaseType"), summary: text(formData, "summary") }, actor);
  redirect("/administration/operations?created=release");
}
