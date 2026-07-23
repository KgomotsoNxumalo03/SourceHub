import { z } from "zod";

export const operationalEventNames = [
  "login.success", "module.opened", "ticket.created", "ticket.resolved",
  "search.performed", "search.empty", "knowledge.viewed", "report.generated",
  "automation.executed", "mobile.workflow.completed", "onboarding.completed", "feature.adopted",
] as const;

export type OperationalEventName = (typeof operationalEventNames)[number];

export const feedbackSchema = z.object({
  category: z.enum(["BUG", "FEATURE", "USABILITY", "PERFORMANCE", "DOCUMENTATION", "GENERAL"]),
  module: z.string().trim().min(1).max(80),
  description: z.string().trim().min(20).max(5000),
  impact: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  frequency: z.enum(["ONCE", "OCCASIONAL", "FREQUENT", "ALWAYS"]),
  visibility: z.enum(["PRIVATE", "WORKSPACE"]).default("PRIVATE"),
});

export const incidentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  severity: z.enum(["SEV-1", "SEV-2", "SEV-3", "SEV-4"]),
  affectedModules: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  summary: z.string().trim().min(10).max(5000),
});

export const defectSchema = z.object({
  title: z.string().trim().min(3).max(200),
  priority: z.enum(["P0", "P1", "P2", "P3", "P4"]),
  environment: z.enum(["DEVELOPMENT", "STAGING", "PILOT", "PRODUCTION"]),
  reproduction: z.string().trim().min(10).max(3000),
  expected: z.string().trim().min(5).max(2000),
  actual: z.string().trim().min(5).max(2000),
  workaround: z.string().trim().max(2000).default(""),
});

export const releaseSchema = z.object({
  version: z.string().trim().min(1).max(40).regex(/^[0-9A-Za-z._-]+$/),
  releaseType: z.enum(["PATCH", "MINOR", "MAJOR", "HOTFIX", "PILOT", "BETA", "STAGED"]),
  summary: z.string().trim().min(10).max(3000),
});

const secretPattern = /(bearer\s+|AIza[0-9A-Za-z_-]+|sk_[0-9A-Za-z_-]+|-----BEGIN|\b(password|passwd|token|secret|api[_-]?key)\s*[:=])/gi;

export function sanitizeOperationalText(value: unknown, max = 5000) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED]")
    .replace(secretPattern, "[REDACTED]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .trim()
    .slice(0, max);
}

export function safeAnalyticsMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(["module", "screen", "source", "result", "status", "platform", "role", "durationMs"]);
  const result: Record<string, string | number | boolean> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!allowed.has(key) || (typeof child !== "string" && typeof child !== "number" && typeof child !== "boolean")) continue;
    const safe = typeof child === "string" ? sanitizeOperationalText(child, 120) : child;
    result[key] = safe;
  }
  return result;
}

export type OperationalHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

export function calculateHealthStatus({ lastSuccessAt, failureCount = 0, now = new Date(), staleAfterMinutes = 15 }: { lastSuccessAt?: Date | null; failureCount?: number; now?: Date; staleAfterMinutes?: number }): OperationalHealthStatus {
  if (!lastSuccessAt) return "UNKNOWN";
  if (failureCount >= 3) return "DOWN";
  if (now.getTime() - lastSuccessAt.getTime() > staleAfterMinutes * 60_000) return "DEGRADED";
  return failureCount > 0 ? "DEGRADED" : "HEALTHY";
}

export const operationalSliTargets = {
  availabilityPercent: 99.5,
  p95LatencyMs: 1500,
  errorRateBasisPoints: 500,
  supportAcknowledgementMinutes: 30,
} as const;
