"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { upsertSettings } from "@/lib/settings";
import { emailConfigFormSchema } from "@/lib/validators";

function errorRedirect(pathname: string, message: string) {
  redirect(`${pathname}?error=${encodeURIComponent(message)}`);
}

function getIpAddress() {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers().get("x-real-ip") ?? null;
}

async function ensureEmailAccess(permission: string) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes(permission)) redirect("/access-denied");
  return actor;
}

export async function updateEmailIntegrationAction(formData: FormData) {
  const actor = await ensureEmailAccess("email.manage");
  const payload = emailConfigFormSchema.safeParse({
    supportAddress: formData.get("supportAddress"),
    provider: formData.get("provider"),
    imapHost: formData.get("imapHost"),
    imapPort: formData.get("imapPort"),
    imapUsername: formData.get("imapUsername"),
    imapPassword: String(formData.get("imapPassword") ?? ""),
    secure: formData.get("secure"),
  });

  if (!payload.success) {
    errorRedirect("/administration/email", payload.error.issues[0]?.message ?? "Please review the email configuration.");
  }

  const data = payload.data!;
  await upsertSettings({
    "emailIntegration.supportAddress": data.supportAddress,
    "emailIntegration.provider": data.provider,
    "emailIntegration.imapHost": data.imapHost || "",
    "emailIntegration.imapPort": String(data.imapPort),
    "emailIntegration.imapUsername": data.imapUsername || "",
    "emailIntegration.secure": String(data.secure),
  });

  await logAudit({
    userId: actor.id,
    action: "emailIntegration.update",
    entityType: "EmailIntegration",
    entityId: "sourcehub-email-integration",
    newValues: {
      supportAddress: data.supportAddress,
      provider: data.provider,
      imapHost: data.imapHost || null,
      imapPort: data.imapPort,
      imapUsername: data.imapUsername || null,
      secure: data.secure,
    },
    ipAddress: getIpAddress(),
  });

  redirect("/administration/email?updated=1");
}

export async function retryEmailMessageAction(formData: FormData) {
  const actor = await ensureEmailAccess("email.manage");
  const messageId = String(formData.get("id") ?? "");
  if (!messageId) errorRedirect("/administration/email", "Missing email message identifier.");

  const message = await prisma.emailMessage.findUnique({ where: { id: messageId } });
  if (!message) errorRedirect("/administration/email", "The selected email message no longer exists.");

  const updated = await prisma.emailMessage.update({
    where: { id: messageId },
    data: {
      processingStatus: "PENDING",
      attemptCount: (message.attemptCount ?? 0) + 1,
      failureReason: null,
      processedAt: null,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "emailMessage.retry",
    entityType: "EmailMessage",
    entityId: messageId,
    previousValues: message,
    newValues: updated,
    ipAddress: getIpAddress(),
  });

  redirect("/administration/email?retried=1");
}
