import { z } from "zod";

export const aiModuleSchema = z.enum(["tickets", "clients", "assets", "networks", "employees", "attendance", "projects", "finance", "knowledge", "reports"]);
export const aiContextTypeSchema = z.enum(["dashboard", "ticket", "client", "asset", "endpoint", "employee", "project", "invoice", "knowledge", "report"]);
export const aiMessageSchema = z.object({ conversationId: z.string().trim().max(160).optional().or(z.literal("")), prompt: z.string().trim().min(2).max(24000), contextModule: aiModuleSchema.optional(), contextType: aiContextTypeSchema.optional(), contextId: z.string().trim().max(160).optional() });
export const aiFeedbackSchema = z.object({ messageId: z.string().trim().min(1).max(160), rating: z.enum(["HELPFUL", "NOT_HELPFUL", "INCORRECT", "MISSING_INFORMATION", "UNSAFE", "OUTDATED"]), comment: z.string().trim().max(1000).optional().or(z.literal("")) });
export const aiProposalSchema = z.object({ proposalId: z.string().trim().min(1).max(160) });
export const aiSettingsSchema = z.object({ enabled: z.boolean(), emergencyDisabled: z.boolean(), allowedModules: z.array(aiModuleSchema).max(10), dailyRequestLimit: z.coerce.number().int().min(1).max(10000), monthlyRequestLimit: z.coerce.number().int().min(1).max(100000), retentionDays: z.coerce.number().int().min(1).max(3650) });
