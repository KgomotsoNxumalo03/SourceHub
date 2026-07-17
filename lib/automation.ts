import type { SlaState } from "@/lib/sla";

export type EscalationAction =
  | "in_app_notification"
  | "email_notification"
  | "technician_notification"
  | "manager_notification"
  | "team_reassignment"
  | "technician_reassignment"
  | "priority_update"
  | "internal_note"
  | "webhook_event";

export type EscalationStage = {
  id: string;
  name: string;
  thresholdPercent: number;
  action: EscalationAction;
  active: boolean;
  targetRole: string | null;
};

export type EscalationPolicyLike = {
  id: string;
  name: string;
  active: boolean;
  stages: EscalationStage[];
};

export function buildExecutionKey(ticketId: string, stageId: string) {
  return `${ticketId}:${stageId}`;
}

export function shouldRunStage(existingKeys: Set<string>, ticketId: string, stageId: string) {
  const key = buildExecutionKey(ticketId, stageId);
  if (existingKeys.has(key)) return false;
  existingKeys.add(key);
  return true;
}

export function resolveEscalationStages({
  policy,
  slaState,
  elapsedPercent,
}: {
  policy: EscalationPolicyLike;
  slaState: SlaState;
  elapsedPercent: number;
}) {
  if (!policy.active || slaState === "RESOLVED") return [];
  return policy.stages
    .filter((stage) => stage.active && elapsedPercent >= stage.thresholdPercent)
    .sort((left, right) => left.thresholdPercent - right.thresholdPercent);
}

export function escalationActionLabel(action: EscalationAction) {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

