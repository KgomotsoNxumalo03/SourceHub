import { z } from "zod";

export const automationDefinitionInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  module: z.string().trim().min(1).max(40),
  triggerKey: z.string().trim().min(1).max(100),
  definitionJson: z.string().trim().min(2).max(50000),
});

export const automationApprovalDecisionSchema = z.object({
  approvalId: z.string().trim().min(1).max(160),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().max(2000).default(""),
});

export const automationActionSchema = z.object({
  executionId: z.string().trim().min(1).max(160),
  mode: z.enum(["retry", "retry_from_beginning", "cancel", "dead_letter", "mark_reviewed"]),
});
