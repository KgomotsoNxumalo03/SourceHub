"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { serializeJsonValue } from "@/lib/json";
import { automationRuleFormSchema } from "@/lib/validators";

function errorRedirect(pathname: string, message: string) {
  redirect(`${pathname}?error=${encodeURIComponent(message)}`);
}

function getIpAddress() {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers().get("x-real-ip") ?? null;
}

async function ensureAutomationAccess(permission: string) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes(permission)) redirect("/access-denied");
  return actor;
}

function parseTargetRole(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function saveRule({
  ruleId,
  formData,
  isUpdate = false,
}: {
  ruleId?: string;
  formData: FormData;
  isUpdate?: boolean;
}) {
  const actor = await ensureAutomationAccess("automation.manage");
  const payload = automationRuleFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    active: formData.get("active"),
    trigger: formData.get("trigger"),
    action: formData.get("action"),
    thresholdPercent: formData.get("thresholdPercent"),
    targetRole: parseTargetRole(formData.get("targetRole")),
  });

  if (!payload.success) {
    errorRedirect(
      isUpdate ? `/administration/automations/${ruleId}` : "/administration/automations/new",
      payload.error.issues[0]?.message ?? "Please review the automation form.",
    );
  }

  const data = payload.data!;
  const persistence = {
    workspaceId: env.DEFAULT_WORKSPACE_ID,
    name: data.name,
    description: data.description || null,
    active: data.active,
    trigger: data.trigger,
    action: data.action,
    thresholdPercent: data.thresholdPercent,
    targetRole: data.targetRole || null,
    updatedById: actor.id,
  };

  const rule = isUpdate && ruleId
    ? await prisma.automationRule.update({ where: { id: ruleId }, data: persistence })
    : await prisma.automationRule.create({ data: { ...persistence, createdById: actor.id } });

  await logAudit({
    userId: actor.id,
    action: isUpdate ? "automation.update" : "automation.create",
    entityType: "AutomationRule",
    entityId: rule.id,
    previousValues: isUpdate ? { ruleId } : undefined,
    newValues: serializeJsonValue(rule),
    ipAddress: getIpAddress(),
  });

  return rule;
}

export async function createAutomationRuleAction(formData: FormData) {
  const rule = await saveRule({ formData, isUpdate: false });
  redirect(`/administration/automations/${rule.id}?created=1`);
}

export async function updateAutomationRuleAction(formData: FormData) {
  const ruleId = String(formData.get("id") ?? "");
  if (!ruleId) errorRedirect("/administration/automations", "Missing automation rule identifier.");
  const rule = await saveRule({ ruleId, formData, isUpdate: true });
  redirect(`/administration/automations/${rule.id}?updated=1`);
}

export async function toggleAutomationRuleAction(formData: FormData) {
  const actor = await ensureAutomationAccess("automation.manage");
  const ruleId = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "true") === "true";
  if (!ruleId) errorRedirect("/administration/automations", "Missing automation rule identifier.");

  await prisma.automationRule.update({
    where: { id: ruleId },
    data: {
      active,
      updatedById: actor.id,
    },
  });

  redirect(`/administration/automations?${active ? "activated=1" : "deactivated=1"}`);
}
