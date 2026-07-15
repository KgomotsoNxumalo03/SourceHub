import "server-only";

import { prisma } from "@/lib/db";

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notification.count({
    where: {
      userId,
      readAt: null,
    },
  });
}

export async function getRecentNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function getNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
