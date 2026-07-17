import "server-only";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export async function getDashboardSummary(actor: { id: string; permissions: string[] }) {
  const [activeEmployees, recentActivity, activeAssets, underRepairAssets, expiringWarranties, recentAssets, openTickets] = await Promise.all([
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
    prisma.asset.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: { in: ["ACTIVE", "DEPLOYED", "LOANED"] as const } } }),
    prisma.asset.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: "UNDER_REPAIR" } }),
    prisma.asset.count({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        warrantyExpiryDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.asset.findMany({
      where: { workspaceId: env.DEFAULT_WORKSPACE_ID },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        assetType: true,
        client: true,
        assignedUser: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.ticket.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] as const } } }),
  ]);

  return {
    activeEmployees,
    recentActivity,
    activeAssets,
    underRepairAssets,
    expiringWarranties,
    recentAssets,
    openTickets,
  };
}
