"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createSession, clearSession } from "@/lib/session";
import { loginSchema } from "@/lib/validators";

export type LoginState = {
  error?: string;
  values?: {
    email?: string;
  };
};

export async function loginAction(
  _: LoginState,
  formData: FormData,
): Promise<LoginState | never> {
  const payload = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!payload.success) {
    return {
      error: payload.error.issues[0]?.message ?? "Please check your login details.",
      values: {
        email: String(formData.get("email") ?? ""),
      },
    };
  }

  const email = payload.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { error: "Invalid email or password.", values: { email } };
  }

  if (user.status === "INACTIVE") {
    return {
      error: "Your account is inactive. Please contact an administrator.",
      values: { email },
    };
  }

  if (user.status === "SUSPENDED") {
    return {
      error: "Your account is suspended. Please contact an administrator.",
      values: { email },
    };
  }

  if (!user.passwordHash) {
    return {
      error: "This account is not configured for password login.",
      values: { email },
    };
  }

  const passwordMatches = await bcrypt.compare(payload.data.password, user.passwordHash);

  if (!passwordMatches) {
    return { error: "Invalid email or password.", values: { email } };
  }

  await createSession(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const requestHeaders = await headers();
  const ipAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    null;

  await logAudit({
    userId: user.id,
    action: "auth.login",
    entityType: "Session",
    entityId: user.id,
    metadata: {
      email: user.email,
      source: "credentials",
    },
    ipAddress,
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  const user = await currentUser();
  if (user) {
    const requestHeaders = await headers();
    const ipAddress =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-real-ip") ??
      null;

    await logAudit({
      userId: user.id,
      action: "auth.logout",
      entityType: "Session",
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress,
    });
  }

  await clearSession();
  redirect("/login");
}
