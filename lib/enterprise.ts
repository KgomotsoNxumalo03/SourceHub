import "server-only";

import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { z } from "zod";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin, adminApp } from "@/lib/db";
import { env } from "@/lib/env";
import { hasPermission, type CurrentUser } from "@/lib/permissions";
import { enterpriseScopes, identityProviderSchema, isPrivateAddress, safeCompare, signWebhookPayload, validateIdentityProvider } from "@/lib/enterprise-core";
import type { EnterpriseScope } from "@/lib/enterprise-core";

export { enterpriseScopes, identityProviderSchema, isPrivateAddress, safeCompare, signWebhookPayload, validateIdentityProvider } from "@/lib/enterprise-core";
export type { EnterpriseScope } from "@/lib/enterprise-core";
export type EnterpriseApiPrincipal = {
  serviceAccountId: string;
  credentialId: string;
  workspaceId: string;
  ownerId: string | null;
  scopes: EnterpriseScope[];
  clientIds: string[];
  officeIds: string[];
  correlationId: string;
};

export const mfaPolicySchema = z.object({
  name: z.string().trim().min(2).max(120),
  workspaceId: z.string().trim().min(1),
  enabled: z.boolean().default(false),
  appliesTo: z.enum(["ALL_USERS", "ROLE", "USER", "HIGH_RISK_ACTIONS"]),
  roleNames: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  userIds: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  factorPolicy: z.enum(["FIREBASE_MFA", "IDENTITY_PROVIDER_MFA", "EITHER"]).default("IDENTITY_PROVIDER_MFA"),
  recoveryEnabled: z.boolean().default(false),
});

export const officeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9-]+$/),
  workspaceId: z.string().trim().min(1),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  timeZone: z.string().trim().min(1).max(80),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactNumber: z.string().trim().max(60).optional().or(z.literal("")),
  managerId: z.string().trim().max(160).optional().or(z.literal("")),
  defaultWorkingHours: z.object({ start: z.string(), end: z.string(), days: z.array(z.string()).max(7) }).default({ start: "08:00", end: "17:00", days: ["MON", "TUE", "WED", "THU", "FRI"] }),
  active: z.boolean().default(true),
});

export const featureFlagSchema = z.object({
  name: z.string().trim().min(2).max(120).regex(/^[a-z0-9._-]+$/),
  description: z.string().trim().max(500),
  workspaceId: z.string().trim().min(1),
  officeId: z.string().trim().max(160).optional().or(z.literal("")),
  roleNames: z.array(z.string().trim().max(80)).max(30).default([]),
  userGroup: z.string().trim().max(120).optional().or(z.literal("")),
  environment: z.enum(["development", "staging", "production", "all"]).default("all"),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.coerce.number().int().min(0).max(100).default(0),
  emergencyDisabled: z.boolean().default(false),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export const maintenanceWindowSchema = z.object({
  workspaceId: z.string().trim().min(1),
  message: z.string().trim().min(2).max(1000),
  startAt: z.coerce.date(),
  expectedEndAt: z.coerce.date().optional(),
  affectedModules: z.array(z.string().trim().max(80)).max(50).default([]),
  readOnlyMode: z.boolean().default(true),
  emergency: z.boolean().default(false),
  clientFacing: z.boolean().default(false),
});

export const serviceAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  workspaceId: z.string().trim().min(1),
  ownerId: z.string().trim().max(160).optional().or(z.literal("")),
  scopes: z.array(z.enum(enterpriseScopes)).min(1).max(enterpriseScopes.length),
  clientIds: z.array(z.string().trim().max(160)).max(100).default([]),
  officeIds: z.array(z.string().trim().max(160)).max(100).default([]),
  expiresAt: z.coerce.date().optional(),
  rateLimitPerMinute: z.coerce.number().int().min(1).max(10000).default(env.ENTERPRISE_API_RATE_LIMIT_PER_MINUTE),
  allowedIpAddresses: z.array(z.string().trim().max(64)).max(100).default([]),
});

export const webhookSubscriptionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  workspaceId: z.string().trim().min(1),
  endpointUrl: z.string().trim().url(),
  eventTypes: z.array(z.string().trim().regex(/^[a-z0-9._-]+$/)).min(1).max(50),
  payloadVersion: z.enum(["2026-07-01"]).default("2026-07-01"),
  active: z.boolean().default(true),
  secretRef: z.string().trim().max(240).optional().or(z.literal("")),
});

function now() { return new Date(); }
function hashApiSecret(value: string) { return createHmac("sha256", env.ENTERPRISE_API_KEY_PEPPER).update(value).digest("hex"); }
function hashValue(value: string) { return createHash("sha256").update(value).digest("hex"); }
function safeMetadata(value: unknown) { return JSON.parse(JSON.stringify(value, (_key, child) => child instanceof Date ? child.toISOString() : child)); }

export function createOneTimeSecret(prefix: string) { return `${prefix}_${randomBytes(32).toString("hex")}`; }

export async function assertSafeWebhookUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) throw new Error("Webhook endpoints must use HTTPS.");
  if (isPrivateAddress(url.hostname)) throw new Error("Webhook endpoints may not target private or loopback addresses.");
  const resolved = await lookup(url.hostname, { all: true });
  if (resolved.some((entry) => isPrivateAddress(entry.address))) throw new Error("Webhook endpoints may not resolve to private or loopback addresses.");
  return url;
}

export async function recordEnterpriseAudit({ actorId, workspaceId, action, targetType, targetId, result = "SUCCESS", reason, metadata, correlationId = randomUUID() }: { actorId?: string | null; workspaceId: string; action: string; targetType: string; targetId?: string | null; result?: string; reason?: string | null; metadata?: unknown; correlationId?: string }) {
  const id = randomUUID();
  await firestoreAdmin.collection(collectionNames.enterpriseAuditEvents).doc(id).set({ id, workspaceId, actorId: actorId ?? null, action, targetType, targetId: targetId ?? null, source: "SOURCEHUB_SERVER", correlationId, result, reason: reason ?? null, metadata: safeMetadata(metadata ?? {}), createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 2555 * 86400000) });
  return { id, correlationId };
}

export async function createServiceAccount(input: z.input<typeof serviceAccountSchema>, actor: CurrentUser) {
  if (!hasPermission(actor, "api.manage")) throw new Error("You do not have permission to manage API identities.");
  const value = serviceAccountSchema.parse(input);
  if (value.workspaceId !== env.DEFAULT_WORKSPACE_ID) throw new Error("The service identity must belong to the active workspace.");
  const serviceAccountId = randomUUID();
  const credentialId = randomUUID();
  const secret = createOneTimeSecret("shk");
  const timestamp = now();
  await firestoreAdmin.collection(collectionNames.apiServiceAccounts).doc(serviceAccountId).create({ id: serviceAccountId, ...value, ownerId: value.ownerId || actor.id, status: "ACTIVE", createdBy: actor.id, updatedBy: actor.id, createdAt: timestamp, updatedAt: timestamp });
  await firestoreAdmin.collection(collectionNames.apiCredentials).doc(credentialId).create({ id: credentialId, serviceAccountId, workspaceId: value.workspaceId, secretHash: hashApiSecret(secret), secretPrefix: secret.slice(0, 12), status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp, expiresAt: value.expiresAt ?? null, lastUsedAt: null, rotatedFromId: null });
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId: value.workspaceId, action: "api.service_account.created", targetType: "ApiServiceAccount", targetId: serviceAccountId, metadata: { scopes: value.scopes, credentialId } });
  return { serviceAccountId, credentialId, secret };
}

function requestCorrelationId(request: Request) { return request.headers.get("x-correlation-id")?.slice(0, 120) || randomUUID(); }
function requestedApiKey(request: Request) { const header = request.headers.get("x-sourcehub-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""; return header.startsWith("shk_") ? header : null; }

async function incrementApiRateLimit(credentialId: string, serviceAccount: Record<string, any>) {
  const minute = new Date().toISOString().slice(0, 16);
  const reference = firestoreAdmin.collection(collectionNames.apiRateLimits).doc(`${credentialId}:${minute}`.replace(/[^a-zA-Z0-9:_-]/g, "_"));
  await firestoreAdmin.runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    const count = Number(document.data()?.count ?? 0);
    const limit = Number(serviceAccount.rateLimitPerMinute ?? env.ENTERPRISE_API_RATE_LIMIT_PER_MINUTE);
    if (count >= limit) throw new Error("API rate limit exceeded.");
    transaction.set(reference, { id: reference.id, credentialId, workspaceId: serviceAccount.workspaceId, minute, count: count + 1, updatedAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 3600000) }, { merge: true });
  });
}

export async function authenticateEnterpriseApiRequest(request: Request): Promise<EnterpriseApiPrincipal> {
  if (!env.ENTERPRISE_ENABLED) throw new Error("The enterprise API is disabled.");
  const secret = requestedApiKey(request);
  if (!secret) throw new Error("An enterprise API key is required.");
  const snapshot = await firestoreAdmin.collection(collectionNames.apiCredentials).where("secretHash", "==", hashApiSecret(secret)).where("status", "==", "ACTIVE").limit(1).get();
  if (snapshot.empty) { await firestoreAdmin.collection(collectionNames.apiAuditEvents).add({ action: "api.authentication.failed", result: "FAILED", reason: "INVALID_CREDENTIAL", createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 2555 * 86400000) }); throw new Error("The enterprise API key is invalid or revoked."); }
  const credential = snapshot.docs[0];
  const credentialData = credential.data();
  if (credentialData.expiresAt?.toDate && credentialData.expiresAt.toDate() <= now()) throw new Error("The enterprise API key has expired.");
  const serviceAccountDocument = await firestoreAdmin.collection(collectionNames.apiServiceAccounts).doc(String(credentialData.serviceAccountId)).get();
  const serviceAccount = serviceAccountDocument.data() ?? {};
  if (!serviceAccountDocument.exists || serviceAccount.status !== "ACTIVE") throw new Error("The enterprise service identity is inactive.");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const allowedIps = Array.isArray(serviceAccount.allowedIpAddresses) ? serviceAccount.allowedIpAddresses.map(String) : [];
  if (allowedIps.length && (!ip || !allowedIps.includes(ip))) throw new Error("This API key is not permitted from the current network.");
  await incrementApiRateLimit(credential.id, serviceAccount);
  await credential.ref.update({ lastUsedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const scopes = (Array.isArray(serviceAccount.scopes) ? serviceAccount.scopes : []).filter((scope): scope is EnterpriseScope => (enterpriseScopes as readonly string[]).includes(String(scope)));
  return { serviceAccountId: serviceAccountDocument.id, credentialId: credential.id, workspaceId: String(serviceAccount.workspaceId), ownerId: serviceAccount.ownerId ? String(serviceAccount.ownerId) : null, scopes, clientIds: Array.isArray(serviceAccount.clientIds) ? serviceAccount.clientIds.map(String) : [], officeIds: Array.isArray(serviceAccount.officeIds) ? serviceAccount.officeIds.map(String) : [], correlationId: requestCorrelationId(request) };
}

export function requireApiScope(principal: EnterpriseApiPrincipal, scope: EnterpriseScope) { if (!principal.scopes.includes(scope)) throw new Error(`The API key does not include ${scope}.`); }

export async function verifyFirebaseIdentityToken(idToken: string, provider: "GOOGLE" | "MICROSOFT_ENTRA") {
  if (!env.ENTERPRISE_FIREBASE_IDP_ENABLED) throw new Error("Enterprise Firebase identity providers are disabled until cloud-console setup is approved.");
  const decoded = await getAuth(adminApp).verifyIdToken(idToken, true);
  const providerName = String(decoded.firebase?.sign_in_provider ?? "");
  if (provider === "GOOGLE" && providerName !== "google.com") throw new Error("The token was not issued by Google sign-in.");
  if (provider === "MICROSOFT_ENTRA" && providerName !== "microsoft.com") throw new Error("The token was not issued by Microsoft Entra sign-in.");
  if (!decoded.email || decoded.email_verified !== true) throw new Error("A verified email address is required.");
  return decoded;
}

export async function getMaintenanceState(workspaceId = env.DEFAULT_WORKSPACE_ID) {
  const snapshot = await firestoreAdmin.collection(collectionNames.maintenanceWindows).where("workspaceId", "==", workspaceId).where("status", "==", "ACTIVE").limit(10).get();
  type MaintenanceEntry = { id: string; startAt?: unknown; expectedEndAt?: unknown; readOnlyMode?: boolean; affectedModules?: string[] };
  const current = snapshot.docs.map((document): MaintenanceEntry => ({ id: document.id, ...document.data() })).find((entry) => new Date(String((entry.startAt as any)?.toDate?.() ?? entry.startAt)).getTime() <= Date.now() && (!entry.expectedEndAt || new Date(String((entry.expectedEndAt as any)?.toDate?.() ?? entry.expectedEndAt)).getTime() >= Date.now()));
  return current ?? null;
}

export async function assertEnterpriseWriteAvailable(workspaceId = env.DEFAULT_WORKSPACE_ID, module?: string) {
  const maintenance = await getMaintenanceState(workspaceId);
  if (maintenance && (maintenance.readOnlyMode === true) && (!module || (maintenance.affectedModules ?? []).includes(module))) throw new Error("SourceHub is in controlled read-only maintenance mode.");
}


export async function getEnterpriseSecuritySummary(workspaceId = env.DEFAULT_WORKSPACE_ID) {
  const [providers, alerts, sessions, accounts, credentials, flags, maintenance, backups, recoveryTests] = await Promise.all([
    firestoreAdmin.collection(collectionNames.enterpriseIdentityProviders).where("workspaceId", "==", workspaceId).limit(50).get(),
    firestoreAdmin.collection(collectionNames.securityAlerts).where("workspaceId", "==", workspaceId).where("status", "==", "OPEN").limit(50).get(),
    firestoreAdmin.collection(collectionNames.enterpriseSessions).where("workspaceId", "==", workspaceId).where("status", "==", "ACTIVE").limit(100).get(),
    firestoreAdmin.collection(collectionNames.apiServiceAccounts).where("workspaceId", "==", workspaceId).where("status", "==", "ACTIVE").limit(100).get(),
    firestoreAdmin.collection(collectionNames.apiCredentials).where("workspaceId", "==", workspaceId).where("status", "==", "ACTIVE").limit(100).get(),
    firestoreAdmin.collection(collectionNames.featureFlags).where("workspaceId", "==", workspaceId).limit(100).get(),
    getMaintenanceState(workspaceId),
    firestoreAdmin.collection(collectionNames.backupExecutions).where("workspaceId", "==", workspaceId).limit(10).get(),
    firestoreAdmin.collection(collectionNames.disasterRecoveryTests).where("workspaceId", "==", workspaceId).limit(10).get(),
  ]);
  return { providers: providers.docs.map((doc) => ({ id: doc.id, ...doc.data() })), openAlerts: alerts.size, activeSessions: sessions.size, activeServiceAccounts: accounts.size, activeCredentials: credentials.size, featureFlags: flags.docs.map((doc) => ({ id: doc.id, ...doc.data() })), maintenance, backupStatus: { configured: env.ENTERPRISE_BACKUP_STATUS === "CONFIGURED", lastExecution: backups.docs[0]?.data() ?? null }, recoveryTest: recoveryTests.docs[0]?.data() ?? null };
}

export function publicEnterpriseConfig(config: Record<string, any>) { const { secretHash: _secretHash, clientSecret: _clientSecret, privateKey: _privateKey, ...safe } = config; return safe; }
