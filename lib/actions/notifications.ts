"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function returnToPath(formData: FormData) {
  return String(formData.get("returnTo") ?? "/notifications");
}

export async function markNotificationReadAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const notificationId = String(formData.get("notificationId") ?? "");
  const returnTo = returnToPath(formData);

  if (notificationId) {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { readAt: new Date() },
    });
  }

  revalidatePath(returnTo);
  redirect(returnTo);
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const returnTo = returnToPath(formData);

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath(returnTo);
  redirect(returnTo);
}
