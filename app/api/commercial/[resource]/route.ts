import { currentUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { acceptTenantInvitation, billingProviderStatus, changeTenantInvitation, createBillingAction, createSupportSession, createTenantApiCredential, createTenantExport, createTenantImport, createTenantInvitation, getCommercialOperations, getCommercialReadiness, getTenantCommercialData, getUsageSummary, installIntegration, integrationCatalog, isCommercialModeEnabled, provisionTenant, requestTenantDomain, resolveTenantEntitlements, revokeTenantApiCredential, saveCommercialReadiness, scheduleTenantDeletion, switchTenantContext, transitionTenantLifecycle, updateBranding, updateOnboarding } from "@/lib/commercial";
import { hasPermission } from "@/lib/permissions";
import { defaultWorkspaceId } from "@/lib/workspace";

async function actorOrError() {
  const actor = await currentUser();
  if (!actor) throw new Error("Authentication is required.");
  return actor;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Commercial SaaS request failed.";
  const status = /authentication is required/i.test(message) ? 401 : /permission|authorised|authorized|tenant context/i.test(message) ? 403 : /disabled|readiness gate|billing is disabled/i.test(message) ? 503 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const actor = await actorOrError();
    const { resource } = await params;
    if (resource === "readiness") {
      if (!hasPermission(actor, "commercial.platform.view") && !hasPermission(actor, "commercial.readiness.manage")) throw new Error("You do not have permission to view commercial readiness.");
      return Response.json({ environmentEnabled: process.env.COMMERCIAL_SAAS_ENABLED === "true", billingEnabled: process.env.COMMERCIAL_BILLING_ENABLED === "true", readiness: await getCommercialReadiness() });
    }
    if (resource === "operations") {
      if (!hasPermission(actor, "commercial.operations.view")) throw new Error("You do not have permission to view commercial operations.");
      return Response.json({ tenants: await getCommercialOperations() });
    }
    if (resource === "context") return Response.json(await getTenantCommercialData(actor));
    if (resource === "plans") {
      if (!hasPermission(actor, "commercial.platform.view") && !hasPermission(actor, "tenant.entitlements.view")) throw new Error("You do not have permission to view commercial plans.");
      const snapshot = await (await import("@/lib/db")).firestoreAdmin.collection("commercialPlans").where("status", "==", "PUBLISHED").limit(50).get();
      return Response.json({ plans: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })) });
    }
    if (resource === "entitlements") {
      const context = await getTenantCommercialData(actor);
      const entitlements = await resolveTenantEntitlements(context.context.tenantId);
      return Response.json({ tenant: context.context, entitlements });
    }
    if (resource === "usage") return Response.json(await getUsageSummary((await getTenantCommercialData(actor)).context.tenantId));
    if (resource === "onboarding" || resource === "branding" || resource === "billing") {
      const data = await getTenantCommercialData(actor);
      return Response.json({ ...data, ...(resource === "billing" ? { provider: await billingProviderStatus() } : {}) });
    }
    if (resource === "integrations") {
      const data = await getTenantCommercialData(actor);
      const snapshot = await (await import("@/lib/db")).firestoreAdmin.collection("commercialIntegrationInstallations").where("tenantId", "==", data.context.tenantId).limit(50).get();
      return Response.json({ catalog: integrationCatalog, installations: snapshot.docs.map((document) => ({ id: document.id, ...document.data(), secretRef: undefined })) });
    }
    if (resource === "api-credentials" || resource === "domains") {
      const data = await getTenantCommercialData(actor);
      const collection = resource === "api-credentials" ? "apiCredentials" : "tenantDomains";
      const snapshot = await (await import("@/lib/db")).firestoreAdmin.collection(collection).where("tenantId", "==", data.context.tenantId).limit(100).get();
      return Response.json({ items: snapshot.docs.map((document) => ({ id: document.id, ...document.data(), secretHash: undefined, tokenHash: undefined })) });
    }
    if (resource === "mode") return Response.json({ enabled: await isCommercialModeEnabled(defaultWorkspaceId), environmentEnabled: process.env.COMMERCIAL_SAAS_ENABLED === "true" });
    throw new Error("Unknown commercial resource.");
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const actor = await actorOrError();
    const { resource } = await params;
    const body = await request.json();
    if (resource === "readiness") return Response.json(await saveCommercialReadiness(body, actor));
    if (resource === "tenants") return Response.json(await provisionTenant(body, actor));
    if (resource === "context") {
      const context = await switchTenantContext(actor, String(body.tenantId));
      const response = Response.json(context);
      const cookieStore = await cookies();
      cookieStore.set("sourcehub_active_tenant", context.tenantId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(Date.now() + 30 * 86400000) });
      return response;
    }
    if (resource === "invitations") {
      if (body.action === "ACCEPT") return Response.json(await acceptTenantInvitation(body, actor));
      if (body.action === "REVOKE" || body.action === "RESEND") return Response.json(await changeTenantInvitation(actor, String(body.invitationId), body.action));
      return Response.json(await createTenantInvitation(body, actor));
    }
    if (resource === "onboarding") return Response.json(await updateOnboarding(body, actor));
    if (resource === "branding") return Response.json(await updateBranding(body, actor));
    if (resource === "billing") return Response.json(await createBillingAction(body, actor));
    if (resource === "integrations") return Response.json(await installIntegration(body, actor));
    if (resource === "api-credentials") {
      if (body.action === "revoke") return Response.json(await revokeTenantApiCredential(actor, String(body.credentialId)));
      return Response.json(await createTenantApiCredential(body, actor));
    }
    if (resource === "domains") return Response.json(await requestTenantDomain(body, actor));
    if (resource === "exports") return Response.json(await createTenantExport(actor));
    if (resource === "imports") return Response.json(await createTenantImport(actor, { fileName: String(body.fileName ?? ""), dryRun: body.dryRun === true }));
    if (resource === "lifecycle") return Response.json(await transitionTenantLifecycle(String(body.tenantId), String(body.to) as never, actor, body.confirmation === true));
    if (resource === "support-sessions") return Response.json(await createSupportSession(body, actor));
    if (resource === "deletion") return Response.json(await scheduleTenantDeletion(actor, body.confirmation === true));
    throw new Error("Unknown commercial resource.");
  } catch (error) { return errorResponse(error); }
}
