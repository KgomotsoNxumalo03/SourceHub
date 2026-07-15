"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { passwordChangeSchema, profileSchema } from "@/lib/validators";

function errorRedirect(message: string) {
  return redirect(`/profile?error=${encodeURIComponent(message)}`);
}

export async function updateProfileAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const payload = profileSchema.safeParse({
    phone: formData.get("phone"),
    profileImageUrl: formData.get("profileImageUrl"),
  });

  if (!payload.success) {
    errorRedirect(payload.error.issues[0]?.message ?? "Please check your profile details.");
  }

  const data = payload.data!;

  const previous = await prisma.user.findUnique({
    where: { id: user.id },
    select: { phone: true, profileImageUrl: true },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phone: data.phone || null,
      profileImageUrl: data.profileImageUrl || null,
    },
  });

  await logAudit({
    userId: user.id,
    action: "profile.update",
    entityType: "User",
    entityId: user.id,
    previousValues: previous,
    newValues: {
      phone: data.phone || null,
      profileImageUrl: data.profileImageUrl || null,
    },
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect("/profile?updated=profile");
}

export async function changePasswordAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const payload = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!payload.success) {
    errorRedirect(payload.error.issues[0]?.message ?? "Please check your password details.");
  }

  const data = payload.data!;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!record?.passwordHash) {
    errorRedirect("Password changes are not available for this account.");
  }

  const passwordHash = record?.passwordHash!;

  const matches = await bcrypt.compare(data.currentPassword, passwordHash);
  if (!matches) {
    errorRedirect("Your current password is incorrect.");
  }

  const newHash = await bcrypt.hash(data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  await logAudit({
    userId: user.id,
    action: "profile.password_change",
    entityType: "User",
    entityId: user.id,
    metadata: { source: "self-service" },
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect("/profile?updated=password");
}
