import "server-only";

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { env } from "@/lib/env";
import { hasPermission, type CurrentUser } from "@/lib/permissions";
import { defaultWorkspaceId } from "@/lib/workspace";
import { assertEntitlement, assertLifecycleTransition, commercialLifecycleStates, isInvitationUsable, isValidHexColor, resolveEffectiveEntitlement, safeCompare, signCommercialBillingPayload, type CommercialLifecycleState, type EntitlementDefinition } from "@/lib/commercial-core";

export const COMMERCIAL_TENANT_COOKIE = "sourcehub_active_tenant";

export const tenantProvisioningSchema = z.object({
  name: z.string().trim().min(2).max(120),
  locale: z.string().trim().min(2).max(20).default("en-ZA"),
  timeZone: z.string().trim().min(1).max(80).default("Africa/Johannesburg"),
  currency: z.string().trim().length(3).toUpperCase().default("ZAR"),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const tenantBrandingSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  logoPath: z.string().trim().max(500).optional().or(z.literal("")),
  faviconPath: z.string().trim().max(500).optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#092058"),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#0BBCEB"),
  emailDisplayName: z.string().trim().max(120).default("SourceHub"),
  supportEmail: z.string().email().optional().or(z.literal("")),
  supportPhone: z.string().trim().max(60).optional().or(z.literal("")),
});

export const onboardingSchema = z.object({
  currentStep: z.string().trim().max(80),
  completedSteps: z.array(z.string().trim().max(80)).max(30),
  skippedSteps: z.array(z.string().trim().max(80)).max(30),
  essentialModules: z.array(z.string().trim().max(80)).max(20),
});

export const invitationSchema = z.object({
  email: z.string().email(),
  roleKey: z.enum(["OWNER", "ADMINISTRATOR", "BILLING_ADMINISTRATOR", "SECURITY_ADMINISTRATOR", "MEMBER", "READ_ONLY"]).default("MEMBER"),
  idempotencyKey: z.string().trim().min(8).max(160),
});
export const invitationTokenSchema = z.object({ id: z.string().trim().min(2).max(200), token: z.string().trim().min(32).max(200) });

export const readinessSchema = z.object({
  enabled: z.boolean(),
  checklist: z.object({
    tenantIsolationReviewed: z.boolean(),
    billingProviderReviewed: z.boolean(),
    exportsTested: z.boolean(),
    deletionTested: z.boolean(),
    rulesTested: z.boolean(),
    supportAccessReviewed: z.boolean(),
  }),
  notes: z.string().trim().max(2000).default(""),
});

export const billingActionSchema = z.object({
  action: z.enum(["CHECKOUT", "PORTAL", "CHANGE_PLAN", "CANCEL_AT_PERIOD_END", "REACTIVATE", "CANCEL_NOW"]),
  planKey: z.string().trim().max(80).optional(),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const integrationInstallSchema = z.object({
  catalogId: z.string().trim().min(2).max(120),
  requestedScopes: z.array(z.string().trim().max(120)).max(30),
  secretRef: z.string().trim().max(240).optional().or(z.literal("")),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const tenantApiCredentialSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.string().trim().min(3).max(120)).min(1).max(20),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const tenantDomainSchema = z.object({
  hostname: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
});

export const supportSessionSchema = z.object({
  tenantId: z.string().trim().min(1),
  reason: z.string().trim().min(10).max(1000),
  durationMinutes: z.coerce.number().int().min(5).max(120).default(env.COMMERCIAL_SUPPORT_SESSION_MINUTES),
});

type ReadinessChecklist = z.infer<typeof readinessSchema>["checklist"];
export type CommercialTenantContext = { tenantId: string; workspaceId: string; name: string; lifecycleState: CommercialLifecycleState; roleKey: string; isInternal: boolean; commercialEnabled: boolean };

const internalEntitlements: Record<string, EntitlementDefinition> = {
  "sourcehub.internal": { enabled: true, limit: null, source: "INTERNAL" },
};

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function hmac(value: string) { return createHmac("sha256", env.ENTERPRISE_API_KEY_PEPPER).update(value).digest("hex"); }
function safeMetadata(value: unknown) { return JSON.parse(JSON.stringify(value, (_key, child) => child instanceof Date ? child.toISOString() : child)); }
async function correlationId() { const value = await headers(); return value.get("x-correlation-id")?.slice(0, 120) || randomUUID(); }

function checklistComplete(checklist: ReadinessChecklist | undefined) { return Boolean(checklist && Object.values(checklist).every(Boolean)); }

export async function getCommercialReadiness(tenantId = defaultWorkspaceId) {
  const document = await firestoreAdmin.collection(collectionNames.commercialReadiness).doc(tenantId).get();
  const data = document.data();
  return { tenantId, enabled: data?.enabled === true, checklist: data?.checklist ?? { tenantIsolationReviewed: false, billingProviderReviewed: false, exportsTested: false, deletionTested: false, rulesTested: false, supportAccessReviewed: false }, checklistComplete: checklistComplete(data?.checklist), notes: String(data?.notes ?? ""), updatedAt: data?.updatedAt ?? null };
}

export async function isCommercialModeEnabled(tenantId = defaultWorkspaceId) {
  if (!env.COMMERCIAL_SAAS_ENABLED) return false;
  if (!env.COMMERCIAL_READINESS_REQUIRED) return true;
  const readiness = await getCommercialReadiness(tenantId);
  return readiness.enabled && readiness.checklistComplete;
}

export async function assertCommercialMode(tenantId: string) {
  if (!(await isCommercialModeEnabled(tenantId))) throw new Error("Commercial SaaS mode is disabled until the internal readiness gate is approved.");
}

async function membershipFor(userId: string, tenantId: string) {
  const document = await firestoreAdmin.collection(collectionNames.tenantMemberships).doc(`${tenantId}:${userId}`).get();
  const data = document.data();
  return document.exists && data?.status === "ACTIVE" ? data : null;
}

export async function getCommercialTenantContext(actor: CurrentUser): Promise<CommercialTenantContext> {
  const cookieStore = await cookies();
  const requestedTenantId = cookieStore.get(COMMERCIAL_TENANT_COOKIE)?.value;
  const tenantId = requestedTenantId || (actor as CurrentUser & { workspaceId?: string }).workspaceId || defaultWorkspaceId;
  if (tenantId === defaultWorkspaceId && !(await isCommercialModeEnabled(tenantId))) return { tenantId, workspaceId: tenantId, name: env.DEFAULT_WORKSPACE_NAME, lifecycleState: "ACTIVE", roleKey: "PLATFORM_INTERNAL", isInternal: true, commercialEnabled: false };
  await assertCommercialMode(tenantId);
  const membership = await membershipFor(actor.id, tenantId);
  if (!membership) throw new Error("The active tenant context is not authorised for this account.");
  const tenant = await firestoreAdmin.collection(collectionNames.commercialTenants).doc(tenantId).get();
  if (!tenant.exists || tenant.data()?.tenantId !== tenantId) throw new Error("The requested tenant is unavailable.");
  return { tenantId, workspaceId: tenantId, name: String(tenant.data()?.name ?? tenantId), lifecycleState: String(tenant.data()?.lifecycleState ?? "PROVISIONING") as CommercialLifecycleState, roleKey: String(membership.roleKey), isInternal: false, commercialEnabled: true };
}

export async function requireTenantPermission(actor: CurrentUser, permission: string, tenantId?: string) {
  const context = await getCommercialTenantContext(actor);
  if (context.isInternal && !context.commercialEnabled) throw new Error("Commercial SaaS mode is disabled until the internal readiness gate is approved.");
  if (hasPermission(actor, permission)) return context;
  const allowedRoles: Record<string, string[]> = {
    "tenant.members.manage": ["OWNER", "ADMINISTRATOR"],
    "tenant.settings.manage": ["OWNER", "ADMINISTRATOR"],
    "tenant.billing.view": ["OWNER", "BILLING_ADMINISTRATOR"],
    "tenant.billing.manage": ["OWNER", "BILLING_ADMINISTRATOR"],
    "tenant.entitlements.view": ["OWNER", "ADMINISTRATOR", "BILLING_ADMINISTRATOR"],
    "tenant.usage.view": ["OWNER", "ADMINISTRATOR", "BILLING_ADMINISTRATOR"],
    "tenant.onboarding.manage": ["OWNER", "ADMINISTRATOR"],
    "tenant.branding.manage": ["OWNER", "ADMINISTRATOR"],
    "tenant.integrations.manage": ["OWNER", "ADMINISTRATOR", "SECURITY_ADMINISTRATOR"],
    "tenant.lifecycle.manage": ["OWNER"],
    "tenant.exports.manage": ["OWNER", "ADMINISTRATOR"],
    "tenant.imports.manage": ["OWNER", "ADMINISTRATOR"],
    "tenant.audit.view": ["OWNER", "ADMINISTRATOR", "SECURITY_ADMINISTRATOR", "READ_ONLY"],
    "developer.portal.view": ["OWNER", "ADMINISTRATOR", "MEMBER", "READ_ONLY"],
  };
  if (tenantId && tenantId !== context.tenantId) throw new Error("Tenant context mismatch.");
  if (!allowedRoles[permission]?.includes(context.roleKey)) throw new Error("You do not have permission for this tenant action.");
  return context;
}

export async function recordCommercialAudit(input: { tenantId: string; actorId?: string | null; action: string; targetType: string; targetId?: string | null; result?: string; metadata?: unknown }) {
  const id = randomUUID();
  await firestoreAdmin.collection(collectionNames.enterpriseAuditEvents).doc(id).set({ id, tenantId: input.tenantId, workspaceId: input.tenantId, actorId: input.actorId ?? null, action: `commercial.${input.action}`, targetType: input.targetType, targetId: input.targetId ?? null, result: input.result ?? "SUCCESS", source: "SOURCEHUB_COMMERCIAL_SERVER", correlationId: await correlationId(), metadata: safeMetadata(input.metadata ?? {}), createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 2555 * 86400000) });
  return id;
}

export async function provisionTenant(input: z.input<typeof tenantProvisioningSchema>, actor: CurrentUser) {
  if (!hasPermission(actor, "tenants.manage")) throw new Error("You do not have permission to provision tenants.");
  await assertCommercialMode(defaultWorkspaceId);
  const value = tenantProvisioningSchema.parse(input);
  const tenantId = `tenant-${hash(value.idempotencyKey).slice(0, 32)}`;
  const tenantRef = firestoreAdmin.collection(collectionNames.commercialTenants).doc(tenantId);
  const tenant = await tenantRef.get();
  if (tenant.exists) return { tenantId, created: false };
  const now = new Date();
  const batch = firestoreAdmin.batch();
  batch.set(tenantRef, { tenantId, workspaceId: tenantId, name: value.name, lifecycleState: "PROVISIONING", locale: value.locale, timeZone: value.timeZone, currency: value.currency, ownerId: actor.id, idempotencyKeyHash: hash(value.idempotencyKey), createdAt: now, updatedAt: now });
  batch.set(firestoreAdmin.collection(collectionNames.workspaces).doc(tenantId), { id: tenantId, workspaceId: tenantId, name: value.name, status: "ACTIVE", commercialTenant: true, createdAt: now, updatedAt: now }, { merge: true });
  batch.set(firestoreAdmin.collection(collectionNames.tenantMemberships).doc(`${tenantId}:${actor.id}`), { id: `${tenantId}:${actor.id}`, tenantId, workspaceId: tenantId, userId: actor.id, roleKey: "OWNER", status: "ACTIVE", joinedAt: now, createdAt: now, updatedAt: now });
  batch.set(firestoreAdmin.collection(collectionNames.tenantSettings).doc(tenantId), { id: tenantId, tenantId, workspaceId: tenantId, locale: value.locale, timeZone: value.timeZone, currency: value.currency, createdAt: now, updatedAt: now });
  batch.set(firestoreAdmin.collection(collectionNames.tenantBranding).doc(tenantId), { id: tenantId, tenantId, workspaceId: tenantId, organizationName: value.name, primaryColor: "#092058", accentColor: "#0BBCEB", emailDisplayName: "SourceHub", supportEmail: "", supportPhone: "", createdAt: now, updatedAt: now });
  batch.set(firestoreAdmin.collection(collectionNames.commercialOnboarding).doc(tenantId), { id: tenantId, tenantId, workspaceId: tenantId, currentStep: "organization", completedSteps: [], skippedSteps: [], essentialModules: [], status: "IN_PROGRESS", createdAt: now, updatedAt: now });
  batch.set(firestoreAdmin.collection(collectionNames.commercialSubscriptions).doc(tenantId), { id: tenantId, tenantId, workspaceId: tenantId, planKey: env.COMMERCIAL_DEFAULT_PLAN_KEY, planVersion: 1, lifecycleState: "PROVISIONING", provider: "disabled", currency: value.currency, trialEndsAt: new Date(Date.now() + env.COMMERCIAL_TRIAL_DAYS * 86400000), createdAt: now, updatedAt: now });
  batch.set(firestoreAdmin.collection(collectionNames.tenantProvisioningJobs).doc(tenantId), { id: tenantId, tenantId, workspaceId: tenantId, idempotencyKeyHash: hash(value.idempotencyKey), status: "QUEUED", currentStep: "defaults", attempts: 0, createdAt: now, updatedAt: now });
  await batch.commit();
  await recordCommercialAudit({ tenantId, actorId: actor.id, action: "tenant.provisioned", targetType: "CommercialTenant", targetId: tenantId, metadata: { name: value.name, currency: value.currency } });
  return { tenantId, created: true };
}

export async function createTenantInvitation(input: z.input<typeof invitationSchema>, actor: CurrentUser) {
  const context = await requireTenantPermission(actor, "tenant.members.manage");
  const value = invitationSchema.parse(input);
  const invitationId = `${context.tenantId}:${hash(`${value.email.toLowerCase()}:${value.idempotencyKey}`).slice(0, 24)}`;
  const existing = await firestoreAdmin.collection(collectionNames.tenantInvitations).doc(invitationId).get();
  if (existing.exists && existing.data()?.status === "PENDING") return { invitationId, created: false };
  const rawToken = randomBytes(32).toString("hex");
  await firestoreAdmin.collection(collectionNames.tenantInvitations).doc(invitationId).set({ id: invitationId, tenantId: context.tenantId, workspaceId: context.tenantId, email: value.email.toLowerCase(), roleKey: value.roleKey, tokenHash: hmac(rawToken), status: "PENDING", expiresAt: new Date(Date.now() + 14 * 86400000), createdBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await recordCommercialAudit({ tenantId: context.tenantId, actorId: actor.id, action: "invitation.created", targetType: "TenantInvitation", targetId: invitationId, metadata: { emailDomain: value.email.split("@")[1], roleKey: value.roleKey } });
  return { invitationId, created: true, token: rawToken };
}

export async function acceptTenantInvitation(input: z.input<typeof invitationTokenSchema>, actor: CurrentUser) {
  const value = invitationTokenSchema.parse(input);
  const reference = firestoreAdmin.collection(collectionNames.tenantInvitations).doc(value.id);
  const invitation = await reference.get();
  const data = invitation.data();
  if (!invitation.exists || !data || data.status !== "PENDING" || !data.expiresAt || !isInvitationUsable(String(data.status), data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt))) throw new Error("This invitation is expired, revoked, or already used.");
  if (String(data.email).toLowerCase() !== actor.email.toLowerCase()) throw new Error("This invitation was issued to a different email address.");
  if (hmac(value.token) !== data.tokenHash) throw new Error("The invitation token is invalid.");
  const membershipId = `${data.tenantId}:${actor.id}`;
  await firestoreAdmin.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    if (current.data()?.status !== "PENDING") throw new Error("This invitation has already been used.");
    transaction.set(firestoreAdmin.collection(collectionNames.tenantMemberships).doc(membershipId), { id: membershipId, tenantId: data.tenantId, workspaceId: data.tenantId, userId: actor.id, roleKey: data.roleKey, status: "ACTIVE", invitationId: value.id, joinedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.update(reference, { status: "ACCEPTED", acceptedBy: actor.id, acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  await recordCommercialAudit({ tenantId: String(data.tenantId), actorId: actor.id, action: "invitation.accepted", targetType: "TenantInvitation", targetId: value.id, metadata: { roleKey: data.roleKey } });
  return { tenantId: data.tenantId, membershipId };
}

export async function changeTenantInvitation(actor: CurrentUser, invitationId: string, action: "REVOKE" | "RESEND") {
  const context = await requireTenantPermission(actor, "tenant.members.manage");
  const reference = firestoreAdmin.collection(collectionNames.tenantInvitations).doc(invitationId);
  const invitation = await reference.get();
  if (!invitation.exists || invitation.data()?.tenantId !== context.tenantId) throw new Error("The invitation is not part of the active tenant.");
  if (action === "REVOKE") { await reference.set({ status: "REVOKED", revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return { invitationId, status: "REVOKED", token: null }; }
  const token = randomBytes(32).toString("hex");
  await reference.set({ tokenHash: hmac(token), status: "PENDING", expiresAt: new Date(Date.now() + 14 * 86400000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { invitationId, status: "PENDING", token };
}

export async function resolveTenantEntitlements(tenantId: string) {
  if (tenantId === defaultWorkspaceId && !(await isCommercialModeEnabled(tenantId))) return internalEntitlements;
  await assertCommercialMode(tenantId);
  const subscription = (await firestoreAdmin.collection(collectionNames.commercialSubscriptions).doc(tenantId).get()).data();
  if (!subscription) throw new Error("The tenant subscription projection is unavailable.");
  const plan = (await firestoreAdmin.collection(collectionNames.commercialPlanVersions).doc(`${subscription.planKey}:v${subscription.planVersion ?? 1}`).get()).data();
  const overrides = (await firestoreAdmin.collection(collectionNames.commercialTenantOverrides).where("tenantId", "==", tenantId).limit(100).get()).docs.map((document) => document.data());
  const entitlementMap: Record<string, EntitlementDefinition> = {};
  for (const [feature, definition] of Object.entries((plan?.entitlements ?? {}) as Record<string, EntitlementDefinition>)) {
    const override = overrides.find((entry) => entry.feature === feature);
    entitlementMap[feature] = resolveEffectiveEntitlement(definition, override);
  }
  if (subscription.lifecycleState === "SUSPENDED" || subscription.lifecycleState === "CANCELLED" || subscription.lifecycleState === "ARCHIVED") for (const definition of Object.values(entitlementMap)) definition.enabled = false;
  return entitlementMap;
}

export async function requireTenantEntitlement(tenantId: string, feature: string) { const entitlements = await resolveTenantEntitlements(tenantId); assertEntitlement(entitlements[feature], feature); return entitlements[feature]; }

export async function updateBranding(input: z.input<typeof tenantBrandingSchema>, actor: CurrentUser) {
  const context = await requireTenantPermission(actor, "tenant.branding.manage");
  const value = tenantBrandingSchema.parse(input);
  if (!isValidHexColor(value.primaryColor) || !isValidHexColor(value.accentColor)) throw new Error("Brand colours must be six-digit hexadecimal values.");
  await firestoreAdmin.collection(collectionNames.tenantBranding).doc(context.tenantId).set({ id: context.tenantId, tenantId: context.tenantId, workspaceId: context.tenantId, ...value, updatedBy: actor.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await recordCommercialAudit({ tenantId: context.tenantId, actorId: actor.id, action: "branding.updated", targetType: "TenantBranding", targetId: context.tenantId, metadata: { primaryColor: value.primaryColor, accentColor: value.accentColor } });
  return value;
}

export async function updateOnboarding(input: z.input<typeof onboardingSchema>, actor: CurrentUser) {
  const context = await requireTenantPermission(actor, "tenant.onboarding.manage");
  const value = onboardingSchema.parse(input);
  const completedSteps = Array.from(new Set(value.completedSteps));
  const status = completedSteps.includes("completion") ? "READY" : "IN_PROGRESS";
  await firestoreAdmin.collection(collectionNames.commercialOnboarding).doc(context.tenantId).set({ id: context.tenantId, tenantId: context.tenantId, workspaceId: context.tenantId, ...value, completedSteps, status, updatedBy: actor.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ...value, completedSteps, status };
}

export async function getUsageSummary(tenantId: string) {
  await assertCommercialMode(tenantId);
  const [daily, monthly, quotas] = await Promise.all([
    firestoreAdmin.collection(collectionNames.commercialUsageDaily).where("tenantId", "==", tenantId).limit(100).get(),
    firestoreAdmin.collection(collectionNames.commercialUsageMonthly).where("tenantId", "==", tenantId).limit(100).get(),
    firestoreAdmin.collection(collectionNames.commercialUsageQuotas).where("tenantId", "==", tenantId).limit(100).get(),
  ]);
  return { daily: daily.docs.map((document) => ({ id: document.id, ...document.data() })), monthly: monthly.docs.map((document) => ({ id: document.id, ...document.data() })), quotas: quotas.docs.map((document) => ({ id: document.id, ...document.data() })) };
}

export async function recordUsageEvent(input: { tenantId: string; metric: string; quantity: number; idempotencyKey: string; source: string; actorId?: string | null }) {
  if (input.quantity < 0 || input.quantity > 1000000) throw new Error("Usage quantity is outside the allowed range.");
  await assertCommercialMode(input.tenantId);
  const eventId = `${input.tenantId}:${hash(input.idempotencyKey).slice(0, 40)}`;
  const reference = firestoreAdmin.collection(collectionNames.commercialUsageEvents).doc(eventId);
  if ((await reference.get()).exists) return { eventId, created: false };
  await reference.create({ id: eventId, tenantId: input.tenantId, workspaceId: input.tenantId, metric: input.metric, quantity: input.quantity, source: input.source, actorId: input.actorId ?? null, idempotencyKeyHash: hash(input.idempotencyKey), createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + env.COMMERCIAL_USAGE_EVENT_RETENTION_DAYS * 86400000) });
  return { eventId, created: true };
}

export async function billingProviderStatus() { return { enabled: env.COMMERCIAL_BILLING_ENABLED && env.COMMERCIAL_BILLING_PROVIDER !== "disabled", provider: env.COMMERCIAL_BILLING_PROVIDER, mode: env.COMMERCIAL_BILLING_PROVIDER === "stripe" ? "configuration-required" : "sandbox" }; }

export async function createBillingAction(input: z.input<typeof billingActionSchema>, actor: CurrentUser) {
  const context = await requireTenantPermission(actor, "tenant.billing.manage");
  const value = billingActionSchema.parse(input);
  const provider = await billingProviderStatus();
  if (!provider.enabled) throw new Error("Billing is disabled. SourceHub will not create a checkout or billing portal session.");
  const id = `${context.tenantId}:${hash(value.idempotencyKey).slice(0, 32)}`;
  await firestoreAdmin.collection(collectionNames.commercialBillingActions).doc(id).set({ id, tenantId: context.tenantId, workspaceId: context.tenantId, action: value.action, planKey: value.planKey ?? null, provider: provider.provider, status: "QUEUED", createdBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { id, status: "QUEUED", provider: provider.provider, hostedUrl: null, message: "A trusted billing provider adapter must complete this action." };
}

export async function processBillingWebhook(input: { rawPayload: string; signature: string; timestamp: string }) {
  if (!env.COMMERCIAL_BILLING_ENABLED || !env.COMMERCIAL_BILLING_WEBHOOK_SECRET) throw new Error("Billing webhook processing is disabled until a provider secret is configured.");
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) throw new Error("Billing webhook timestamp is stale or invalid.");
  const expected = signCommercialBillingPayload(env.COMMERCIAL_BILLING_WEBHOOK_SECRET, input.timestamp, input.rawPayload);
  if (!safeCompare(expected, input.signature)) throw new Error("Billing webhook signature is invalid.");
  const payload = JSON.parse(input.rawPayload) as { id?: string; type?: string; tenantId?: string; createdAt?: string; lifecycleState?: CommercialLifecycleState; planKey?: string; planVersion?: number };
  if (!payload.id || !payload.tenantId || !payload.type) throw new Error("Billing webhook payload is incomplete.");
  if (payload.lifecycleState && !commercialLifecycleStates.includes(payload.lifecycleState)) throw new Error("Billing webhook lifecycle state is invalid.");
  const reference = firestoreAdmin.collection(collectionNames.commercialBillingEvents).doc(payload.id);
  if ((await reference.get()).exists) return { id: payload.id, duplicate: true };
  const subscriptionReference = firestoreAdmin.collection(collectionNames.commercialSubscriptions).doc(payload.tenantId);
  const subscription = await subscriptionReference.get();
  if (!subscription.exists) throw new Error("Billing webhook tenant subscription is unavailable.");
  const current = subscription.data() ?? {};
  const incomingTime = payload.createdAt ? Date.parse(payload.createdAt) : Date.now();
  const currentTime = current.lastBillingEventAt?.toDate ? current.lastBillingEventAt.toDate().getTime() : current.lastBillingEventAt ? Date.parse(String(current.lastBillingEventAt)) : 0;
  const staleEvent = Number.isFinite(incomingTime) && currentTime > 0 && incomingTime < currentTime;
  if (!staleEvent && payload.lifecycleState) assertLifecycleTransition(String(current.lifecycleState ?? "PROVISIONING") as CommercialLifecycleState, payload.lifecycleState);
  await reference.create({ id: payload.id, tenantId: payload.tenantId, workspaceId: payload.tenantId, eventType: payload.type, providerCreatedAt: payload.createdAt ?? null, status: staleEvent ? "IGNORED_STALE" : "PROCESSED", payload: { type: payload.type, lifecycleState: payload.lifecycleState ?? null, planKey: payload.planKey ?? null }, processedAt: FieldValue.serverTimestamp() });
  if (staleEvent) return { id: payload.id, duplicate: false, stale: true };
  await subscriptionReference.set({ ...(payload.lifecycleState ? { lifecycleState: payload.lifecycleState } : {}), ...(payload.planKey ? { planKey: payload.planKey } : {}), ...(payload.planVersion ? { planVersion: payload.planVersion } : {}), lastBillingEventAt: payload.createdAt ?? new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await recordCommercialAudit({ tenantId: payload.tenantId, action: "billing.webhook.processed", targetType: "CommercialBillingEvent", targetId: payload.id, metadata: { type: payload.type } });
  return { id: payload.id, duplicate: false };
}

export async function getCommercialOperations() {
  const tenants = await firestoreAdmin.collection(collectionNames.commercialTenants).limit(200).get();
  const rows = await Promise.all(tenants.docs.map(async (tenant) => { const data = tenant.data(); const [subscription, onboarding, usage] = await Promise.all([firestoreAdmin.collection(collectionNames.commercialSubscriptions).doc(tenant.id).get(), firestoreAdmin.collection(collectionNames.commercialOnboarding).doc(tenant.id).get(), firestoreAdmin.collection(collectionNames.commercialUsageMonthly).where("tenantId", "==", tenant.id).limit(1).get()]); return { id: tenant.id, name: data.name, lifecycleState: data.lifecycleState, subscriptionState: subscription.data()?.lifecycleState ?? null, onboardingState: onboarding.data()?.status ?? null, usageMonth: usage.docs[0]?.data() ?? null }; }));
  return rows;
}

export async function createSupportSession(input: z.input<typeof supportSessionSchema>, actor: CurrentUser) {
  if (!hasPermission(actor, "support.sessions.manage")) throw new Error("You do not have permission to create support sessions.");
  const value = supportSessionSchema.parse(input);
  await assertCommercialMode(value.tenantId);
  const id = randomUUID();
  await firestoreAdmin.collection(collectionNames.commercialSupportSessions).doc(id).set({ id, tenantId: value.tenantId, workspaceId: value.tenantId, supportUserId: actor.id, reason: value.reason, status: "PENDING_APPROVAL", visibleBanner: true, expiresAt: new Date(Date.now() + value.durationMinutes * 60000), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await recordCommercialAudit({ tenantId: value.tenantId, actorId: actor.id, action: "support.session.requested", targetType: "CommercialSupportSession", targetId: id, metadata: { durationMinutes: value.durationMinutes } });
  return { id, status: "PENDING_APPROVAL", expiresAt: new Date(Date.now() + value.durationMinutes * 60000) };
}

export async function switchTenantContext(actor: CurrentUser, tenantId: string) {
  if (tenantId === defaultWorkspaceId && !(await isCommercialModeEnabled(tenantId))) return { tenantId, workspaceId: tenantId, name: env.DEFAULT_WORKSPACE_NAME, lifecycleState: "ACTIVE" as CommercialLifecycleState, roleKey: "PLATFORM_INTERNAL", isInternal: true, commercialEnabled: false };
  await assertCommercialMode(tenantId);
  const membership = await membershipFor(actor.id, tenantId);
  if (!membership) throw new Error("You are not a member of the requested tenant.");
  const tenant = await firestoreAdmin.collection(collectionNames.commercialTenants).doc(tenantId).get();
  if (!tenant.exists) throw new Error("The requested tenant is unavailable.");
  return { tenantId, workspaceId: tenantId, name: String(tenant.data()?.name ?? tenantId), lifecycleState: String(tenant.data()?.lifecycleState ?? "PROVISIONING") as CommercialLifecycleState, roleKey: String(membership.roleKey), isInternal: false, commercialEnabled: true };
}

export async function saveCommercialReadiness(input: z.input<typeof readinessSchema>, actor: CurrentUser) {
  if (!hasPermission(actor, "commercial.readiness.manage")) throw new Error("You do not have permission to manage commercial readiness.");
  const value = readinessSchema.parse(input);
  const tenantId = defaultWorkspaceId;
  await firestoreAdmin.collection(collectionNames.commercialReadiness).doc(tenantId).set({ id: tenantId, tenantId, workspaceId: tenantId, ...value, environmentGate: env.COMMERCIAL_SAAS_ENABLED, billingGate: env.COMMERCIAL_BILLING_ENABLED, updatedBy: actor.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await recordCommercialAudit({ tenantId, actorId: actor.id, action: "readiness.updated", targetType: "CommercialReadiness", targetId: tenantId, metadata: { enabled: value.enabled, checklistComplete: checklistComplete(value.checklist), environmentGate: env.COMMERCIAL_SAAS_ENABLED } });
  return getCommercialReadiness(tenantId);
}

export async function transitionTenantLifecycle(tenantId: string, to: CommercialLifecycleState, actor: CurrentUser, confirmation = false) {
  const context = await requireTenantPermission(actor, "tenant.lifecycle.manage", tenantId);
  if (!confirmation) throw new Error("Lifecycle changes require explicit confirmation.");
  const reference = firestoreAdmin.collection(collectionNames.commercialTenants).doc(tenantId);
  const subscriptionReference = firestoreAdmin.collection(collectionNames.commercialSubscriptions).doc(tenantId);
  const tenant = await reference.get();
  if (!tenant.exists) throw new Error("The tenant is unavailable.");
  const from = String(tenant.data()?.lifecycleState ?? context.lifecycleState) as CommercialLifecycleState;
  assertLifecycleTransition(from, to);
  await firestoreAdmin.runTransaction(async (transaction) => {
    transaction.update(reference, { lifecycleState: to, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(subscriptionReference, { lifecycleState: to, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.create(firestoreAdmin.collection(collectionNames.commercialLifecycleJobs).doc(), { id: randomUUID(), tenantId, workspaceId: tenantId, from, to, status: "RECORDED", requestedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  await recordCommercialAudit({ tenantId, actorId: actor.id, action: "lifecycle.transitioned", targetType: "CommercialTenant", targetId: tenantId, metadata: { from, to } });
  return { tenantId, from, to };
}

export async function getTenantCommercialData(actor: CurrentUser, tenantId?: string) {
  const context = await getCommercialTenantContext(actor);
  if (tenantId && tenantId !== context.tenantId && !hasPermission(actor, "commercial.platform.view")) throw new Error("Tenant context mismatch.");
  const selected = tenantId ?? context.tenantId;
  const [branding, settings, onboarding, subscription] = await Promise.all([
    firestoreAdmin.collection(collectionNames.tenantBranding).doc(selected).get(),
    firestoreAdmin.collection(collectionNames.tenantSettings).doc(selected).get(),
    firestoreAdmin.collection(collectionNames.commercialOnboarding).doc(selected).get(),
    firestoreAdmin.collection(collectionNames.commercialSubscriptions).doc(selected).get(),
  ]);
  return { context, branding: branding.data() ?? null, settings: settings.data() ?? null, onboarding: onboarding.data() ?? null, subscription: subscription.data() ?? null };
}

export const integrationCatalog = [
  { id: "sourcehub-webhook", name: "SourceHub Webhooks", category: "Developer tools", version: "1.0.0", scopes: ["webhooks.write"], health: "SANDBOX", documentationUrl: "/developers#webhooks", platformManaged: true },
  { id: "sourcehub-import-export", name: "SourceHub Data Portability", category: "Data", version: "1.0.0", scopes: ["data.read", "data.write"], health: "READY", documentationUrl: "/developers#portability", platformManaged: true },
] as const;

export async function installIntegration(input: z.input<typeof integrationInstallSchema>, actor: CurrentUser) {
  const context = await requireTenantPermission(actor, "tenant.integrations.manage");
  const value = integrationInstallSchema.parse(input);
  const catalog = integrationCatalog.find((entry) => entry.id === value.catalogId);
  if (!catalog) throw new Error("This integration is not available in the catalog.");
  if (!catalog.scopes.every((scope) => value.requestedScopes.includes(scope))) throw new Error("The installation must request every required integration scope.");
  const id = `${context.tenantId}:${catalog.id}`;
  const existing = await firestoreAdmin.collection(collectionNames.commercialIntegrationInstallations).doc(id).get();
  if (existing.exists) return { id, created: false, secretStored: Boolean(existing.data()?.secretRef) };
  await firestoreAdmin.collection(collectionNames.commercialIntegrationInstallations).doc(id).set({ id, tenantId: context.tenantId, workspaceId: context.tenantId, catalogId: catalog.id, requestedScopes: value.requestedScopes, status: "ENABLED", health: catalog.health, version: catalog.version, secretRef: value.secretRef || null, createdBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await recordCommercialAudit({ tenantId: context.tenantId, actorId: actor.id, action: "integration.installed", targetType: "CommercialIntegrationInstallation", targetId: id, metadata: { catalogId: catalog.id, scopes: value.requestedScopes, secretStored: Boolean(value.secretRef) } });
  return { id, created: true, secretStored: Boolean(value.secretRef) };
}

export async function createTenantExport(actor: CurrentUser) {
  const context = await requireTenantPermission(actor, "tenant.exports.manage");
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + env.COMMERCIAL_MAX_EXPORT_DAYS * 86400000);
  await firestoreAdmin.collection(collectionNames.commercialExports).doc(id).set({ id, tenantId: context.tenantId, workspaceId: context.tenantId, status: "QUEUED", requestedBy: actor.id, expiresAt, storagePath: null, downloadUrl: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await recordCommercialAudit({ tenantId: context.tenantId, actorId: actor.id, action: "export.requested", targetType: "CommercialExport", targetId: id });
  return { id, status: "QUEUED", expiresAt };
}

export async function createTenantImport(actor: CurrentUser, input: { fileName: string; dryRun: boolean }) {
  const context = await requireTenantPermission(actor, "tenant.imports.manage");
  if (!input.dryRun) throw new Error("Commercial imports must start with a dry run.");
  if (!/\.(csv|json)$/i.test(input.fileName) || input.fileName.length > 180) throw new Error("Only bounded CSV or JSON dry-run imports are supported.");
  const id = randomUUID();
  await firestoreAdmin.collection(collectionNames.commercialImports).doc(id).set({ id, tenantId: context.tenantId, workspaceId: context.tenantId, fileName: input.fileName.replace(/[\r\n]/g, ""), dryRun: true, status: "QUEUED", requestedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { id, status: "QUEUED", dryRun: true };
}

export async function createTenantApiCredential(input: z.input<typeof tenantApiCredentialSchema>, actor: CurrentUser) {
  const context = await requireTenantPermission(actor, "tenant.integrations.manage");
  const value = tenantApiCredentialSchema.parse(input);
  const serviceAccountId = `${context.tenantId}:${hash(value.idempotencyKey).slice(0, 32)}`;
  const credentialId = `${serviceAccountId}:credential`;
  const existing = await firestoreAdmin.collection(collectionNames.apiServiceAccounts).doc(serviceAccountId).get();
  if (existing.exists) return { serviceAccountId, credentialId, created: false, secret: null };
  const secret = `shk_${randomBytes(32).toString("hex")}`;
  const now = new Date();
  await firestoreAdmin.collection(collectionNames.apiServiceAccounts).doc(serviceAccountId).set({ id: serviceAccountId, tenantId: context.tenantId, workspaceId: context.tenantId, name: value.name, scopes: value.scopes, ownerId: actor.id, status: "ACTIVE", createdBy: actor.id, createdAt: now, updatedAt: now });
  await firestoreAdmin.collection(collectionNames.apiCredentials).doc(credentialId).set({ id: credentialId, tenantId: context.tenantId, workspaceId: context.tenantId, serviceAccountId, secretHash: hmac(secret), secretPrefix: secret.slice(0, 12), status: "ACTIVE", createdAt: now, updatedAt: now, expiresAt: null, lastUsedAt: null });
  await recordCommercialAudit({ tenantId: context.tenantId, actorId: actor.id, action: "api.credential.created", targetType: "ApiCredential", targetId: credentialId, metadata: { serviceAccountId, scopes: value.scopes, secretReturned: true } });
  return { serviceAccountId, credentialId, created: true, secret };
}

export async function revokeTenantApiCredential(actor: CurrentUser, credentialId: string) {
  const context = await requireTenantPermission(actor, "tenant.integrations.manage");
  const reference = firestoreAdmin.collection(collectionNames.apiCredentials).doc(credentialId);
  const credential = await reference.get();
  if (!credential.exists || credential.data()?.tenantId !== context.tenantId) throw new Error("The API credential is not part of the active tenant.");
  await reference.set({ status: "REVOKED", revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await recordCommercialAudit({ tenantId: context.tenantId, actorId: actor.id, action: "api.credential.revoked", targetType: "ApiCredential", targetId: credentialId });
  return { credentialId, status: "REVOKED" };
}

export async function requestTenantDomain(input: z.input<typeof tenantDomainSchema>, actor: CurrentUser) {
  const context = await requireTenantPermission(actor, "tenant.settings.manage");
  if (!env.COMMERCIAL_CUSTOM_DOMAINS_ENABLED) throw new Error("Custom domain activation is not enabled. This record is only available after a supported hosting process is approved.");
  const value = tenantDomainSchema.parse(input);
  const id = `${context.tenantId}:${hash(value.hostname).slice(0, 24)}`;
  await firestoreAdmin.collection(collectionNames.tenantDomains).doc(id).set({ id, tenantId: context.tenantId, workspaceId: context.tenantId, hostname: value.hostname, status: "REQUESTED", ownershipVerification: "PENDING", certificateStatus: "NOT_REQUESTED", activationStatus: "INACTIVE", dnsInstructions: { recordType: "TXT", name: `_sourcehub.${value.hostname}`, value: "Provided by approved hosting process" }, createdBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await recordCommercialAudit({ tenantId: context.tenantId, actorId: actor.id, action: "domain.requested", targetType: "TenantDomain", targetId: id, metadata: { hostname: value.hostname } });
  return { id, status: "REQUESTED", activationStatus: "INACTIVE" };
}

export async function scheduleTenantDeletion(actor: CurrentUser, confirmation = false) {
  const context = await requireTenantPermission(actor, "tenant.lifecycle.manage");
  if (!confirmation) throw new Error("Tenant deletion scheduling requires explicit confirmation.");
  const deletionAt = new Date(Date.now() + env.COMMERCIAL_TENANT_DELETION_RECOVERY_DAYS * 86400000);
  await firestoreAdmin.collection(collectionNames.commercialTenants).doc(context.tenantId).set({ lifecycleState: "CANCELLATION_PENDING", deletionAt, readOnlyAt: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const jobId = `${context.tenantId}:deletion`;
  await firestoreAdmin.collection(collectionNames.commercialLifecycleJobs).doc(jobId).set({ id: jobId, tenantId: context.tenantId, workspaceId: context.tenantId, type: "DELETION", status: "SCHEDULED", deletionAt, requestedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await recordCommercialAudit({ tenantId: context.tenantId, actorId: actor.id, action: "tenant.deletion.scheduled", targetType: "CommercialTenant", targetId: context.tenantId, metadata: { deletionAt, recoveryDays: env.COMMERCIAL_TENANT_DELETION_RECOVERY_DAYS } });
  return { tenantId: context.tenantId, status: "CANCELLATION_PENDING", deletionAt };
}

export const lifecycleStates = commercialLifecycleStates;
