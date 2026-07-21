import "server-only";

import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";

export async function getUnreadNotificationCount(userId: string) {
  return unstable_cache(
    () => prisma.notification.count({ where: { userId, readAt: null } }),
    ["sourcehub-notification-count", userId],
    { revalidate: 10 },
  )();
}

export async function getRecentNotifications(userId: string) {
  return unstable_cache(
    () => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    ["sourcehub-notifications", userId],
    { revalidate: 10 },
  )();
}

export async function getNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
