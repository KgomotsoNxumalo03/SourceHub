import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";

import { prisma } from "@/lib/db";

export const SESSION_COOKIE_NAME = "sourcehub_session";
const SESSION_DAYS = 7;

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
  const ipAddress =
    headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers().get("x-real-ip") ??
    null;
  const userAgent = headers().get("user-agent");

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: sessionExpiresAt(),
      ipAddress,
      userAgent,
    },
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
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(tokenValue) },
    });
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
