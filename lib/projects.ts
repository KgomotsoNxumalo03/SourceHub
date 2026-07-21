import "server-only";

import { prisma } from "@/lib/db";
export * from "@/lib/project-utils";
import { calculateProjectHealth, progressFromTasks } from "@/lib/project-utils";

export async function refreshProjectSummary(
  projectId: string,
  actorId: string,
) {
  const [project, tasks, milestones, risks] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectTask.findMany({ where: { projectId }, take: 1000 }),
    prisma.projectMilestone.findMany({ where: { projectId }, take: 300 }),
    prisma.projectRisk.findMany({ where: { projectId }, take: 300 }),
  ]);
  if (!project) return null;
  const result = calculateProjectHealth({ project, tasks, milestones, risks });
  const progress = progressFromTasks(tasks);
  await prisma.project.update({
    where: { id: projectId },
    data: {
      progressPercentage: progress,
      healthState: result.health,
      healthFactors: result.factors,
      healthCalculationVersion: result.version,
      healthCalculatedAt: result.calculatedAt,
      updatedBy: actorId,
    },
  });
  await prisma.projectHealthSnapshot.create({
    data: {
      workspaceId: project.workspaceId,
      projectId,
      healthState: result.health,
      factors: result.factors,
      calculationVersion: result.version,
      calculatedAt: result.calculatedAt,
      createdBy: actorId,
    },
  });
  return { ...result, progress };
}
