import { projectStatuses, taskStatuses } from "@/lib/validators";

export const projectTypeLabels: Record<string, string> = {
  CLIENT_IMPLEMENTATION: "Client implementation",
  INFRASTRUCTURE: "Infrastructure",
  NETWORK_INSTALLATION: "Network installation",
  M365_MIGRATION: "Microsoft 365 migration",
  CYBERSECURITY: "Cybersecurity",
  HARDWARE_DEPLOYMENT: "Hardware deployment",
  SOFTWARE_DEPLOYMENT: "Software deployment",
  CLOUD_MIGRATION: "Cloud migration",
  INTERNAL_IT: "Internal IT",
  BUSINESS_IMPROVEMENT: "Business improvement",
  WEBSITE_APPLICATION: "Website or application",
  OTHER: "Other",
};
export const projectStatusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PLANNING: "Planning",
  AWAITING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  AT_RISK: "At risk",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  ARCHIVED: "Archived",
};
export const taskStatusLabels: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  IN_REVIEW: "In review",
  WAITING: "Waiting",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
export const projectPriorityLabels: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
export const healthLabels: Record<string, string> = {
  HEALTHY: "Healthy",
  MONITOR: "Monitor",
  AT_RISK: "At risk",
  CRITICAL: "Critical",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
};

const projectTransitions: Record<string, string[]> = {
  DRAFT: ["PLANNING", "CANCELLED"],
  PLANNING: ["AWAITING_APPROVAL", "DRAFT", "CANCELLED"],
  AWAITING_APPROVAL: ["APPROVED", "PLANNING", "CANCELLED"],
  APPROVED: ["ACTIVE", "ON_HOLD", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "AT_RISK", "CANCELLED"],
  AT_RISK: ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"],
  COMPLETED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: ["ACTIVE"],
};
const taskTransitions: Record<string, string[]> = {
  BACKLOG: ["TODO", "CANCELLED"],
  TODO: ["IN_PROGRESS", "WAITING", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "IN_REVIEW", "WAITING", "COMPLETED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "WAITING", "CANCELLED"],
  IN_REVIEW: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  WAITING: ["TODO", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionProjectStatus(from: string, to: string) {
  return from === to || Boolean(projectTransitions[from]?.includes(to));
}
export function canTransitionTaskStatus(from: string, to: string) {
  return from === to || Boolean(taskTransitions[from]?.includes(to));
}
export function progressFromTasks(tasks: Array<{ status?: string }>) {
  return tasks.length
    ? Math.round(
        (tasks.filter((task) => task.status === "COMPLETED").length /
          tasks.length) *
          100,
      )
    : 0;
}
export function dependencyWouldCycle(
  edges: Array<{ predecessorTaskId: string; successorTaskId: string }>,
  predecessorTaskId: string,
  successorTaskId: string,
) {
  if (predecessorTaskId === successorTaskId) return true;
  const graph = new Map<string, string[]>();
  for (const edge of edges)
    graph.set(edge.predecessorTaskId, [
      ...(graph.get(edge.predecessorTaskId) ?? []),
      edge.successorTaskId,
    ]);
  graph.set(predecessorTaskId, [
    ...(graph.get(predecessorTaskId) ?? []),
    successorTaskId,
  ]);
  const seen = new Set<string>();
  const stack = [successorTaskId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === predecessorTaskId) return true;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}
export function riskSeverity(probability: string, impact: string) {
  return probability === "HIGH" && impact === "HIGH"
    ? "CRITICAL"
    : probability === "HIGH" || impact === "HIGH"
      ? "HIGH"
      : probability === "MEDIUM" || impact === "MEDIUM"
        ? "MEDIUM"
        : "LOW";
}
export function calculateProjectHealth({
  project,
  tasks,
  milestones,
  risks,
}: {
  project: any;
  tasks: any[];
  milestones: any[];
  risks: any[];
}) {
  const now = Date.now();
  const overdueTasks = tasks.filter(
    (task) =>
      task.status !== "COMPLETED" &&
      task.status !== "CANCELLED" &&
      task.dueDate &&
      new Date(task.dueDate).getTime() < now,
  );
  const blockedTasks = tasks.filter((task) => task.status === "BLOCKED");
  const missedMilestones = milestones.filter(
    (milestone) => milestone.status === "MISSED",
  );
  const criticalRisks = risks.filter(
    (risk) =>
      risk.severity === "CRITICAL" &&
      !["RESOLVED", "CLOSED"].includes(risk.status),
  );
  const factors = [
    overdueTasks.length
      ? `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}`
      : null,
    blockedTasks.length
      ? `${blockedTasks.length} blocked task${blockedTasks.length === 1 ? "" : "s"}`
      : null,
    missedMilestones.length
      ? `${missedMilestones.length} missed milestone${missedMilestones.length === 1 ? "" : "s"}`
      : null,
    criticalRisks.length
      ? `${criticalRisks.length} critical open risk${criticalRisks.length === 1 ? "" : "s"}`
      : null,
  ].filter((factor): factor is string => Boolean(factor));
  const health =
    project.status === "COMPLETED"
      ? "COMPLETED"
      : project.status === "ON_HOLD"
        ? "ON_HOLD"
        : criticalRisks.length || missedMilestones.length
          ? "CRITICAL"
          : blockedTasks.length || overdueTasks.length
            ? "AT_RISK"
            : factors.length
              ? "MONITOR"
              : "HEALTHY";
  return { health, factors, version: 1, calculatedAt: new Date() };
}
export function dateOrNull(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}
export function labelsFromText(value: string | null | undefined) {
  return (value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
}
export function projectSearchTokens(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values.flatMap((value) =>
        (value ?? "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length > 1),
      ),
    ),
  );
}
export type ProjectStatus = (typeof projectStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
