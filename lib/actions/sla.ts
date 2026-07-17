"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { serializeJsonValue } from "@/lib/json";
import { slaPolicyFormSchema } from "@/lib/validators";

function errorRedirect(pathname: string, message: string) {
  redirect(`${pathname}?error=${encodeURIComponent(message)}`);
}

function getIpAddress() {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers().get("x-real-ip") ?? null;
}

function splitList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function ensureSlaAccess(permission: string) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes(permission)) redirect("/access-denied");
  return actor;
}

async function resolveOptionalRelation(
  relation: "client" | "supportAgreement" | "ticketCategory",
  id: string | null,
) {
  if (!id) return null;
  const collection =
    relation === "client"
      ? prisma.client
      : relation === "supportAgreement"
        ? prisma.supportAgreement
        : prisma.ticketCategory;

  const record = await collection.findUnique({ where: { id } });
  if (!record) return null;
  return record;
}

async function savePolicy({
  policyId,
  formData,
  isUpdate = false,
}: {
  policyId?: string;
  formData: FormData;
  isUpdate?: boolean;
}) {
  const actor = await ensureSlaAccess("slaPolicies.manage");
  const payload = slaPolicyFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    active: formData.get("active"),
    clientId: formData.get("clientId"),
    supportAgreementId: formData.get("supportAgreementId"),
    priority: formData.get("priority"),
    categoryId: formData.get("categoryId"),
    firstResponseMinutes: formData.get("firstResponseMinutes"),
    resolutionMinutes: formData.get("resolutionMinutes"),
    businessHoursStart: formData.get("businessHoursStart"),
    businessHoursEnd: formData.get("businessHoursEnd"),
    workingDays: splitList(formData.get("workingDays")),
    publicHolidays: splitList(formData.get("publicHolidays")),
    pauseConditions: splitList(formData.get("pauseConditions")),
    escalationRules: splitList(formData.get("escalationRules")),
  });

  if (!payload.success) {
    errorRedirect(
      isUpdate ? `/administration/sla-policies/${policyId}` : "/administration/sla-policies/new",
      payload.error.issues[0]?.message ?? "Please review the SLA policy form.",
    );
  }

  const data = payload.data!;
  const [client, supportAgreement, category] = await Promise.all([
    resolveOptionalRelation("client", data.clientId || null),
    resolveOptionalRelation("supportAgreement", data.supportAgreementId || null),
    resolveOptionalRelation("ticketCategory", data.categoryId || null),
  ]);

  if (data.clientId && !client) {
    errorRedirect(
      isUpdate ? `/administration/sla-policies/${policyId}` : "/administration/sla-policies/new",
      "Selected client does not exist.",
    );
  }

  if (data.supportAgreementId && (!supportAgreement || supportAgreement.clientId !== client?.id)) {
    errorRedirect(
      isUpdate ? `/administration/sla-policies/${policyId}` : "/administration/sla-policies/new",
      "Selected support agreement does not belong to that client.",
    );
  }

  if (data.categoryId && !category) {
    errorRedirect(
      isUpdate ? `/administration/sla-policies/${policyId}` : "/administration/sla-policies/new",
      "Selected ticket category does not exist.",
    );
  }

  const persistence = {
    workspaceId: env.DEFAULT_WORKSPACE_ID,
    name: data.name,
    description: data.description || null,
    active: data.active,
    clientId: client?.id ?? null,
    supportAgreementId: supportAgreement?.id ?? null,
    priority: data.priority || null,
    categoryId: category?.id ?? null,
    firstResponseMinutes: data.firstResponseMinutes,
    resolutionMinutes: data.resolutionMinutes,
    businessHoursStart: data.businessHoursStart,
    businessHoursEnd: data.businessHoursEnd,
    workingDays: data.workingDays,
    publicHolidays: data.publicHolidays,
    pauseConditions: data.pauseConditions,
    escalationRules: data.escalationRules,
    updatedById: actor.id,
  };

  const policy = isUpdate && policyId
    ? await prisma.slaPolicy.update({
        where: { id: policyId },
        data: persistence,
      })
    : await prisma.slaPolicy.create({
        data: {
          ...persistence,
          createdById: actor.id,
        },
      });

  await logAudit({
    userId: actor.id,
    action: isUpdate ? "slaPolicies.update" : "slaPolicies.create",
    entityType: "SlaPolicy",
    entityId: policy.id,
    previousValues: isUpdate ? { policyId } : undefined,
    newValues: serializeJsonValue(policy),
    ipAddress: getIpAddress(),
  });

  return policy;
}

export async function createSlaPolicyAction(formData: FormData) {
  const policy = await savePolicy({ formData, isUpdate: false });
  redirect(`/administration/sla-policies/${policy.id}?created=1`);
}

export async function updateSlaPolicyAction(formData: FormData) {
  const policyId = String(formData.get("id") ?? "");
  if (!policyId) errorRedirect("/administration/sla-policies", "Missing SLA policy identifier.");
  const policy = await savePolicy({ policyId, formData, isUpdate: true });
  redirect(`/administration/sla-policies/${policy.id}?updated=1`);
}

export async function toggleSlaPolicyAction(formData: FormData) {
  const actor = await ensureSlaAccess("slaPolicies.manage");
  const policyId = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "true") === "true";
  if (!policyId) errorRedirect("/administration/sla-policies", "Missing SLA policy identifier.");

  const policy = await prisma.slaPolicy.update({
    where: { id: policyId },
    data: {
      active,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: active ? "slaPolicies.activate" : "slaPolicies.deactivate",
    entityType: "SlaPolicy",
    entityId: policy.id,
    newValues: { active },
    ipAddress: getIpAddress(),
  });

  redirect(`/administration/sla-policies/${policy.id}?${active ? "activated=1" : "deactivated=1"}`);
}
