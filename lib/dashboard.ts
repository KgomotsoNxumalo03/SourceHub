import "server-only";

import { prisma } from "@/lib/db";

export async function getDashboardSummary(actor: { id: string; permissions: string[] }) {
  const [activeEmployees, recentActivity] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return {
    activeEmployees,
    recentActivity,
  };
}
