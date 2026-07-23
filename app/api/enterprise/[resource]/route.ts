import { FieldValue } from "firebase-admin/firestore";
import { createHash, randomUUID } from "node:crypto";

import { collectionNames } from "@/lib/collections";
import { currentUser } from "@/lib/auth";
import { firestoreAdmin } from "@/lib/db";
import { env } from "@/lib/env";
import { assertSafeWebhookUrl, createOneTimeSecret, createServiceAccount, featureFlagSchema, getEnterpriseSecuritySummary, getMaintenanceState, identityProviderSchema, maintenanceWindowSchema, officeSchema, recordEnterpriseAudit, serviceAccountSchema, validateIdentityProvider, webhookSubscriptionSchema } from "@/lib/enterprise";
import { hasPermission } from "@/lib/permissions";

async function actorFor(permission: string) {
  const actor = await currentUser();
  if (!actor || !hasPermission(actor, permission)) throw new Error("You do not have permission to manage this enterprise area.");
  return actor;
}

function safe(value: any): any { if (Array.isArray(value)) return value.map(safe); if (value?.toDate) return value.toDate().toISOString(); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !["secretHash", "tokenHash", "privateKey", "clientSecret"].includes(key)).map(([key, child]) => [key, safe(child)])); return value; }
function errorResponse(error: unknown, status = 400) { return Response.json({ error: error instanceof Error ? error.message : "Enterprise request failed." }, { status }); }
function allowedCollection(resource: string) { const map: Record<string, string> = { providers: collectionNames.enterpriseIdentityProviders, offices: collectionNames.offices, "service-accounts": collectionNames.apiServiceAccounts, webhooks: collectionNames.webhookSubscriptions, flags: collectionNames.featureFlags, sessions: collectionNames.enterpriseSessions, alerts: collectionNames.securityAlerts, backups: collectionNames.backupExecutions, recovery: collectionNames.disasterRecoveryTests }; return map[resource]; }

export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params;
    if (resource === "security") { const actor = await actorFor("security.centre.view"); return Response.json(await getEnterpriseSecuritySummary(env.DEFAULT_WORKSPACE_ID)); }
    const permission = resource === "providers" ? "enterprise.sso.view" : resource === "sessions" ? "enterprise.sessions.view" : resource === "offices" ? "offices.view" : resource === "service-accounts" ? "api.view" : resource === "webhooks" ? "webhooks.view" : resource === "backups" ? "backups.view" : resource === "recovery" ? "disaster_recovery.view" : "enterprise.settings.view";
    const actor = await actorFor(permission);
    if (resource === "maintenance") return Response.json({ maintenance: await getMaintenanceState() });
    const collection = allowedCollection(resource);
    if (!collection) return errorResponse(new Error("Unknown enterprise resource."), 404);
    let query: FirebaseFirestore.Query = firestoreAdmin.collection(collection).where("workspaceId", "==", env.DEFAULT_WORKSPACE_ID).limit(100);
    if (resource === "sessions") query = query.where("userId", "==", actor.id);
    const snapshot = await query.get();
    return Response.json({ data: snapshot.docs.map((document) => safe({ id: document.id, ...document.data() })) });
  } catch (error) { return errorResponse(error, error instanceof Error && error.message.includes("permission") ? 403 : 400); }
}

export async function POST(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await params;
    const body = await request.json();
    if (resource === "providers") {
      const actor = await actorFor("enterprise.sso.manage");
      const value = validateIdentityProvider({ ...body, workspaceId: env.DEFAULT_WORKSPACE_ID });
      const id = body.id ? String(body.id) : randomUUID();
      await firestoreAdmin.collection(collectionNames.enterpriseIdentityProviders).doc(id).set({ id, ...value, workspaceId: env.DEFAULT_WORKSPACE_ID, createdBy: actor.id, updatedBy: actor.id, ...(body.id ? {} : { createdAt: FieldValue.serverTimestamp() }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await recordEnterpriseAudit({ actorId: actor.id, workspaceId: env.DEFAULT_WORKSPACE_ID, action: "enterprise.sso.provider.saved", targetType: "IdentityProvider", targetId: id, metadata: { providerType: value.providerType, enabled: value.enabled, secretRef: value.secretRef || null } });
      return Response.json({ id, provider: safe(value) });
    }
    if (resource === "offices") {
      const actor = await actorFor("offices.manage"); const value = officeSchema.parse({ ...body, workspaceId: env.DEFAULT_WORKSPACE_ID }); const id = body.id ? String(body.id) : randomUUID();
      await firestoreAdmin.collection(collectionNames.offices).doc(id).set({ id, ...value, workspaceId: env.DEFAULT_WORKSPACE_ID, status: value.active ? "ACTIVE" : "INACTIVE", createdBy: actor.id, updatedBy: actor.id, ...(body.id ? {} : { createdAt: FieldValue.serverTimestamp() }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await recordEnterpriseAudit({ actorId: actor.id, workspaceId: env.DEFAULT_WORKSPACE_ID, action: "office.saved", targetType: "Office", targetId: id, metadata: { code: value.code } }); return Response.json({ id });
    }
    if (resource === "service-accounts") {
      const actor = await actorFor("api.manage"); const created = await createServiceAccount({ ...body, workspaceId: env.DEFAULT_WORKSPACE_ID }, actor); return Response.json(created);
    }
    if (resource === "webhooks") {
      const actor = await actorFor("webhooks.manage"); const value = webhookSubscriptionSchema.parse({ ...body, workspaceId: env.DEFAULT_WORKSPACE_ID }); await assertSafeWebhookUrl(value.endpointUrl); const id = body.id ? String(body.id) : randomUUID(); const secret = body.id ? null : createOneTimeSecret("whsec");
      if (!secret && !value.secretRef && process.env.NODE_ENV === "production") throw new Error("Production webhooks require an approved Secret Manager reference.");
      await firestoreAdmin.collection(collectionNames.webhookSubscriptions).doc(id).set({ id, ...value, workspaceId: env.DEFAULT_WORKSPACE_ID, status: value.active ? "ACTIVE" : "DISABLED", ...(secret ? { secretHash: hashWebhookSecret(secret) } : {}), ...(body.id ? {} : { createdAt: FieldValue.serverTimestamp() }), secretRef: value.secretRef || env.ENTERPRISE_WEBHOOK_SECRET_REF || null, createdBy: actor.id, updatedBy: actor.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await recordEnterpriseAudit({ actorId: actor.id, workspaceId: env.DEFAULT_WORKSPACE_ID, action: "webhook.subscription.saved", targetType: "WebhookSubscription", targetId: id, metadata: { eventTypes: value.eventTypes, endpointHost: new URL(value.endpointUrl).hostname } }); return Response.json({ id, secret, secretDisplayOnce: Boolean(secret), warning: secret ? "Store this secret in the approved server-side secret service. It is not stored in Firestore." : null });
    }
    if (resource === "flags") {
      const actor = await actorFor("feature_flags.manage"); const value = featureFlagSchema.parse({ ...body, workspaceId: env.DEFAULT_WORKSPACE_ID }); const id = body.id ? String(body.id) : randomUUID(); await firestoreAdmin.collection(collectionNames.featureFlags).doc(id).set({ id, ...value, workspaceId: env.DEFAULT_WORKSPACE_ID, createdBy: actor.id, updatedBy: actor.id, ...(body.id ? {} : { createdAt: FieldValue.serverTimestamp() }), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); await firestoreAdmin.collection(collectionNames.featureFlagHistory).add({ id: randomUUID(), flagId: id, workspaceId: env.DEFAULT_WORKSPACE_ID, changedBy: actor.id, change: safe(value), createdAt: FieldValue.serverTimestamp() }); return Response.json({ id });
    }
    if (resource === "maintenance") {
      const actor = await actorFor("maintenance_mode.manage"); const value = maintenanceWindowSchema.parse({ ...body, workspaceId: env.DEFAULT_WORKSPACE_ID }); const id = randomUUID(); await firestoreAdmin.collection(collectionNames.maintenanceWindows).doc(id).set({ id, ...value, workspaceId: env.DEFAULT_WORKSPACE_ID, status: "ACTIVE", createdBy: actor.id, updatedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); await recordEnterpriseAudit({ actorId: actor.id, workspaceId: env.DEFAULT_WORKSPACE_ID, action: "maintenance.activated", targetType: "MaintenanceWindow", targetId: id, metadata: { affectedModules: value.affectedModules, emergency: value.emergency } }); return Response.json({ id });
    }
    if (resource === "sessions" && body.action === "revoke") {
      const actor = await actorFor("enterprise.sessions.revoke"); const id = String(body.sessionId ?? ""); if (!id) throw new Error("A session ID is required."); const session = await firestoreAdmin.collection(collectionNames.enterpriseSessions).doc(id).get(); if (!session.exists || session.data()?.workspaceId !== env.DEFAULT_WORKSPACE_ID) throw new Error("Session not found."); await session.ref.update({ status: "REVOKED", revokedBy: actor.id, revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); await firestoreAdmin.collection(collectionNames.sessions).doc(id).delete(); await recordEnterpriseAudit({ actorId: actor.id, workspaceId: env.DEFAULT_WORKSPACE_ID, action: "session.revoked", targetType: "EnterpriseSession", targetId: id }); return Response.json({ ok: true });
    }
    return errorResponse(new Error("Unknown enterprise resource."), 404);
  } catch (error) { return errorResponse(error, error instanceof Error && error.message.includes("permission") ? 403 : 400); }
}

function hashWebhookSecret(secret: string) { return createHash("sha256").update(secret).digest("hex"); }
