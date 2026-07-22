import "server-only";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getAppCheck } from "firebase-admin/app-check";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken, createRawToken } from "@/lib/session";

export type MobilePrincipal = {
  id: string;
  workspaceId: string;
  email: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  status: string;
  permissions: string[];
  roles: string[];
  portalClientId: string | null;
  mobilePermissions: string[];
  sessionId: string;
};

export class MobileAuthError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 401, code = "MOBILE_AUTH_REQUIRED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function versionParts(value: string) { return value.split(".").map((part) => Number(part.replace(/[^0-9].*$/, "")) || 0).slice(0, 3).concat([0, 0, 0]).slice(0, 3); }
function versionAtLeast(current: string, minimum: string) { const left = versionParts(current); const right = versionParts(minimum); return left[0] > right[0] || (left[0] === right[0] && (left[1] > right[1] || (left[1] === right[1] && left[2] >= right[2]))); }

export function mobileVersionPolicy(appVersion: string) {
  return { currentVersion: env.MOBILE_CURRENT_VERSION, minimumSupportedVersion: env.MOBILE_MIN_SUPPORTED_VERSION, recommendedVersion: env.MOBILE_RECOMMENDED_VERSION, updateRequired: !versionAtLeast(appVersion, env.MOBILE_MIN_SUPPORTED_VERSION), updateAvailable: !versionAtLeast(appVersion, env.MOBILE_CURRENT_VERSION) };
}

async function verifyAppCheck(request: Request) {
  if (!env.MOBILE_REQUIRE_APP_CHECK) return;
  const token = request.headers.get("X-Firebase-AppCheck");
  if (!token) throw new MobileAuthError("App verification is required for mobile requests.", 401, "APP_CHECK_REQUIRED");
  try { await getAppCheck().verifyToken(token); } catch { throw new MobileAuthError("App verification failed.", 401, "APP_CHECK_INVALID"); }
}

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  if (!value.toLowerCase().startsWith("bearer ")) throw new MobileAuthError("Sign in is required.");
  const token = value.slice(7).trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new MobileAuthError("The mobile session is invalid.");
  return token;
}

async function principalFromSession(sessionId: string, session: Record<string, any>) {
  const user = await firestoreAdmin.collection(collectionNames.users).doc(String(session.userId)).get();
  if (!user.exists || user.data()?.workspaceId !== session.workspaceId) throw new MobileAuthError("The mobile account is no longer available.", 401, "ACCOUNT_UNAVAILABLE");
  const userData = user.data() ?? {};
  if (userData.status !== "ACTIVE") throw new MobileAuthError("This account is not active.", 403, "ACCOUNT_DISABLED");
  const links = await firestoreAdmin.collection(collectionNames.userRoles).where("userId", "==", user.id).limit(20).get();
  const roles: string[] = [];
  const permissions = new Set<string>();
  for (const link of links.docs) {
    const roleDocument = await firestoreAdmin.collection(collectionNames.roles).doc(String(link.data().roleId)).get();
    if (!roleDocument.exists) continue;
    roles.push(String(roleDocument.data()?.name ?? ""));
    const rolePermissions = await firestoreAdmin.collection(collectionNames.rolePermissions).where("roleId", "==", roleDocument.id).limit(300).get();
    for (const assignment of rolePermissions.docs) {
      const permissionDocument = await firestoreAdmin.collection(collectionNames.permissions).doc(String(assignment.data().permissionId)).get();
      if (permissionDocument.exists) permissions.add(String(permissionDocument.data()?.key ?? ""));
    }
  }
  const mobilePermissions = Array.from(permissions).filter((permission) => permission.startsWith("mobile."));
  if (!permissions.has("mobile.access")) throw new MobileAuthError("This account is not enabled for SourceHub mobile.", 403, "MOBILE_ACCESS_REQUIRED");
  return { id: user.id, workspaceId: String(session.workspaceId), email: String(userData.email ?? ""), employeeNumber: String(userData.employeeNumber ?? ""), firstName: String(userData.firstName ?? ""), lastName: String(userData.lastName ?? ""), jobTitle: userData.jobTitle ? String(userData.jobTitle) : null, status: String(userData.status), permissions: Array.from(permissions), roles, portalClientId: userData.portalClientId ? String(userData.portalClientId) : null, mobilePermissions, sessionId } satisfies MobilePrincipal;
}

export async function createMobileSession({ email, password, deviceId, platform, appVersion, request }: { email: string; password: string; deviceId: string; platform: string; appVersion: string; request: Request }) {
  if (!env.MOBILE_ENABLED || env.MOBILE_EMERGENCY_DISABLED) throw new MobileAuthError("Mobile access is temporarily unavailable.", 503, "MOBILE_DISABLED");
  await verifyAppCheck(request);
  const normalizedEmail = email.trim().toLowerCase();
  const userSnapshot = await firestoreAdmin.collection(collectionNames.users).where("email", "==", normalizedEmail).limit(1).get();
  const user = userSnapshot.empty ? null : userSnapshot.docs[0];
  if (!user || !(await bcrypt.compare(password, String(user.data()?.passwordHash ?? "")))) throw new MobileAuthError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  if (user.data()?.status !== "ACTIVE") throw new MobileAuthError("This account is not active.", 403, "ACCOUNT_DISABLED");
  const sessionId = randomUUID();
  const token = createRawToken();
  const timestamp = new Date();
  await firestoreAdmin.collection(collectionNames.mobileSessions).doc(sessionId).create({ id: sessionId, workspaceId: user.data()?.workspaceId ?? env.DEFAULT_WORKSPACE_ID, userId: user.id, deviceId: deviceId.slice(0, 160), platform: platform.slice(0, 40), appVersion: appVersion.slice(0, 40), tokenHash: hashToken(token), status: "ACTIVE", lastSeenAt: timestamp, expiresAt: new Date(Date.now() + env.MOBILE_SESSION_DAYS * 86400000), createdAt: timestamp, updatedAt: timestamp });
  const principal = await principalFromSession(sessionId, { userId: user.id, workspaceId: user.data()?.workspaceId ?? env.DEFAULT_WORKSPACE_ID });
  return { token, principal, versionPolicy: mobileVersionPolicy(appVersion) };
}

export async function authenticateMobileRequest(request: Request) {
  await verifyAppCheck(request);
  const token = bearerToken(request);
  const sessionSnapshot = await firestoreAdmin.collection(collectionNames.mobileSessions).where("tokenHash", "==", hashToken(token)).where("status", "==", "ACTIVE").limit(1).get();
  if (sessionSnapshot.empty) throw new MobileAuthError("The mobile session is invalid or revoked.", 401, "SESSION_REVOKED");
  const sessionDocument = sessionSnapshot.docs[0];
  const session = sessionDocument.data();
  if (session.expiresAt?.toDate && session.expiresAt.toDate() <= new Date()) { await sessionDocument.ref.update({ status: "EXPIRED", updatedAt: new Date() }); throw new MobileAuthError("The mobile session has expired.", 401, "SESSION_EXPIRED"); }
  await sessionDocument.ref.update({ lastSeenAt: new Date(), updatedAt: new Date() });
  const principal = await principalFromSession(sessionDocument.id, session);
  return { principal, versionPolicy: mobileVersionPolicy(String(session.appVersion ?? env.MOBILE_CURRENT_VERSION)), sessionDocument };
}

export async function revokeMobileSession(request: Request) {
  await verifyAppCheck(request);
  const token = bearerToken(request);
  const sessionSnapshot = await firestoreAdmin.collection(collectionNames.mobileSessions).where("tokenHash", "==", hashToken(token)).limit(1).get();
  if (!sessionSnapshot.empty) await sessionSnapshot.docs[0].ref.update({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() });
}

export function mobileJsonError(error: unknown) {
  const typed = error instanceof MobileAuthError ? error : new MobileAuthError("The mobile request could not be completed.", 400, "MOBILE_REQUEST_FAILED");
  return Response.json({ error: typed.message, code: typed.code }, { status: typed.status });
}
