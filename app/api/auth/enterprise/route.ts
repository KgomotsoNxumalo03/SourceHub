import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin, adminApp, prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { env } from "@/lib/env";
import { identityProviderSchema, recordEnterpriseAudit } from "@/lib/enterprise";

function jsonError(error: unknown, status = 400) { return Response.json({ error: error instanceof Error ? error.message : "Enterprise sign-in failed." }, { status }); }

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const provider = input.provider === "MICROSOFT_ENTRA" ? "MICROSOFT_ENTRA" : input.provider === "GOOGLE" ? "GOOGLE" : null;
    if (!provider || typeof input.idToken !== "string" || !input.idToken) return jsonError(new Error("A supported provider and Firebase ID token are required."));
    if (!env.ENTERPRISE_FIREBASE_IDP_ENABLED) return jsonError(new Error("Enterprise sign-in is disabled until the Firebase/Identity Platform provider setup is approved."), 503);
    const decoded = await getAuth(adminApp).verifyIdToken(input.idToken, true);
    const authProvider = String(decoded.firebase?.sign_in_provider ?? "");
    if ((provider === "GOOGLE" && authProvider !== "google.com") || (provider === "MICROSOFT_ENTRA" && authProvider !== "microsoft.com")) throw new Error("The identity token provider does not match the requested SourceHub provider.");
    if (!decoded.email || decoded.email_verified !== true) throw new Error("A verified email address is required.");
    const providerSnapshot = await firestoreAdmin.collection(collectionNames.enterpriseIdentityProviders).where("workspaceId", "==", env.DEFAULT_WORKSPACE_ID).where("providerType", "==", provider).where("enabled", "==", true).limit(10).get();
    const emailDomain = decoded.email.toLowerCase().split("@")[1] ?? "";
    const configDocument = providerSnapshot.docs.find((document) => { const config = document.data(); return (!config.allowedEmailDomains?.length || config.allowedEmailDomains.includes(emailDomain)) && (!config.tenantId || String(decoded.tid ?? decoded.tenant_id ?? "") === String(config.tenantId)); });
    if (!configDocument) throw new Error("Your identity provider, tenant, or email domain is not approved for SourceHub.");
    const config = identityProviderSchema.parse(configDocument.data());
    if (config.loginEnforcement === "DISABLED") throw new Error("This identity provider is disabled by workspace policy.");
    const assurance = JSON.stringify(decoded).toLowerCase();
    if (env.ENTERPRISE_MFA_ENFORCEMENT_MODE !== "DISABLED" && !assurance.includes("mfa") && !assurance.includes("2fa")) throw new Error("Additional multi-factor authentication is required by SourceHub policy.");
    const subject = String(decoded.sub);
    const linkId = `${configDocument.id}:${subject}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 500);
    const existingLink = await firestoreAdmin.collection(collectionNames.enterpriseIdentityLinks).doc(linkId).get();
    let userId = existingLink.data()?.userId ? String(existingLink.data()?.userId) : "";
    if (!userId && config.allowExistingEmailLinking) {
      const existingUser = await firestoreAdmin.collection(collectionNames.users).where("workspaceId", "==", env.DEFAULT_WORKSPACE_ID).where("email", "==", decoded.email.toLowerCase()).limit(1).get();
      if (!existingUser.empty) userId = existingUser.docs[0].id;
    }
    if (!userId && config.autoCreateUsers && env.ENTERPRISE_ALLOW_AUTO_PROVISIONING) {
      const roleSnapshot = await firestoreAdmin.collection(collectionNames.roles).where("name", "==", config.defaultRole).limit(1).get();
      if (roleSnapshot.empty || config.defaultRole !== env.ENTERPRISE_DEFAULT_ROLE) throw new Error("Automatic provisioning is limited to the configured safe default role.");
      userId = `sso-${subject}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
      await firestoreAdmin.collection(collectionNames.users).doc(userId).create({ id: userId, workspaceId: env.DEFAULT_WORKSPACE_ID, employeeNumber: `SSO-${subject.slice(-12)}`, firstName: String(decoded.name ?? decoded.email.split("@")[0]), lastName: "", email: decoded.email.toLowerCase(), phone: null, jobTitle: null, department: null, profileImageUrl: decoded.picture ?? null, passwordHash: null, status: "ACTIVE", accountSource: "ENTERPRISE_IDP", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      await firestoreAdmin.collection(collectionNames.userRoles).doc(`${userId}:${roleSnapshot.docs[0].id}`).set({ id: `${userId}:${roleSnapshot.docs[0].id}`, userId, roleId: roleSnapshot.docs[0].id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    if (!userId) throw new Error("Your identity is not linked to a SourceHub user. Ask an administrator to link or provision the account.");
    const user = await firestoreAdmin.collection(collectionNames.users).doc(userId).get();
    if (!user.exists || user.data()?.workspaceId !== env.DEFAULT_WORKSPACE_ID || user.data()?.status !== "ACTIVE") throw new Error("The linked SourceHub account is unavailable or disabled.");
    await firestoreAdmin.collection(collectionNames.enterpriseIdentityLinks).doc(linkId).set({ id: linkId, workspaceId: env.DEFAULT_WORKSPACE_ID, providerId: configDocument.id, providerType: provider, subject, userId, email: decoded.email.toLowerCase(), tenantId: decoded.tid ?? decoded.tenant_id ?? null, objectId: decoded.oid ?? null, status: "ACTIVE", lastLoginAt: FieldValue.serverTimestamp(), createdAt: existingLink.data()?.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await firestoreAdmin.collection(collectionNames.enterpriseIdentityHistory).add({ id: `${linkId}:${Date.now()}`, workspaceId: env.DEFAULT_WORKSPACE_ID, linkId, userId, action: existingLink.exists ? "LOGIN" : "LINKED", providerType: provider, createdAt: FieldValue.serverTimestamp() });
    await recordEnterpriseAudit({ actorId: userId, workspaceId: env.DEFAULT_WORKSPACE_ID, action: existingLink.exists ? "identity.login" : "identity.linked", targetType: "EnterpriseIdentityLink", targetId: linkId, metadata: { provider, tenantId: decoded.tid ?? decoded.tenant_id ?? null } });
    await createSession(userId);
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    return Response.json({ ok: true, redirect: "/dashboard" });
  } catch (error) { return jsonError(error); }
}
