import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/db";
import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { env } from "@/lib/env";

export const SESSION_COOKIE_NAME = "sourcehub_session";
const SESSION_DAYS = env.ENTERPRISE_SESSION_DAYS;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createRawToken() {
  return randomBytes(32).toString("hex");
}

export function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export async function createSession(userId: string) {
  const token = createRawToken();
  const tokenHash = hashToken(token);
  const requestHeaders = await headers();
  const ipAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    null;
  const userAgent = requestHeaders.get("user-agent");

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: sessionExpiresAt(),
      ipAddress,
      userAgent,
    },
  });

  await firestoreAdmin.collection(collectionNames.enterpriseSessions).doc(session.id).set({
    id: session.id,
    workspaceId: env.DEFAULT_WORKSPACE_ID,
    userId,
    tokenHash,
    status: "ACTIVE",
    authenticationMethod: "PASSWORD",
    deviceType: requestHeaders.get("sec-ch-ua-mobile") === "?1" ? "MOBILE_BROWSER" : "BROWSER",
    userAgent: userAgent?.slice(0, 300) ?? null,
    ipAddress,
    createdAt: session.createdAt,
    lastActivityAt: new Date(),
    expiresAt: session.expiresAt,
    updatedAt: new Date(),
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });

  return session;
}

export async function getSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function clearSession(token?: string | null) {
  const tokenValue = token ?? (await getSessionToken());
  if (tokenValue) {
    await firestoreAdmin.collection(collectionNames.enterpriseSessions).where("tokenHash", "==", hashToken(tokenValue)).limit(5).get().then(async (snapshot) => Promise.all(snapshot.docs.map((document) => document.ref.update({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() }))));
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(tokenValue) },
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
