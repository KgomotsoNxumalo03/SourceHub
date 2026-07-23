import { z } from "zod";

export const pilotStatuses = ["DRAFT", "PREPARING", "READY_FOR_REVIEW", "APPROVED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export type PilotStatus = (typeof pilotStatuses)[number];
export const pilotChecklistStatuses = ["PENDING", "IN_PROGRESS", "COMPLETE", "BLOCKED"] as const;
export const uatStatuses = ["NOT_RUN", "PASS", "FAIL", "BLOCKED"] as const;
export const uatSignOffStatuses = ["PENDING", "REQUESTED", "APPROVED", "REJECTED"] as const;
export const pilotDecisionOutcomes = ["NOT_READY", "READY_FOR_INTERNAL_DEMONSTRATION", "READY_FOR_CONTROLLED_INTERNAL_PILOT", "CONDITIONALLY_READY", "READY_FOR_EXPANDED_PILOT", "READY_FOR_STAGED_PRODUCTION", "PILOT_PAUSED", "ROLLBACK_REQUIRED"] as const;

export const pilotProgramSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(3000),
  objectives: z.array(z.string().trim().min(3).max(500)).min(1).max(20),
  startDate: z.coerce.date(),
  targetEndDate: z.coerce.date(),
  ownerId: z.string().trim().min(1).max(160),
  participantUserIds: z.array(z.string().trim().min(1).max(160)).max(500),
  participantRoles: z.array(z.string().trim().min(1).max(100)).max(30),
  enabledModules: z.array(z.string().trim().min(1).max(100)).max(50),
  featureFlagIds: z.array(z.string().trim().min(1).max(160)).max(50),
  successCriteria: z.array(z.string().trim().min(3).max(500)).max(30),
  knownLimitations: z.array(z.string().trim().min(3).max(500)).max(30),
  participatingWorkspaceId: z.string().trim().min(1).max(160),
});

export const pilotChecklistItemSchema = z.object({
  title: z.string().trim().min(3).max(240),
  ownerId: z.string().trim().max(160).default(""),
  dueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).default(""),
  evidence: z.string().trim().max(1000).default(""),
  status: z.enum(pilotChecklistStatuses).default("PENDING"),
});

export const uatCaseSchema = z.object({
  title: z.string().trim().min(3).max(240),
  scenarioKey: z.string().trim().min(2).max(100),
  persona: z.string().trim().min(2).max(100),
  module: z.string().trim().min(2).max(100),
  preconditions: z.string().trim().max(2000),
  steps: z.array(z.string().trim().min(2).max(500)).min(1).max(30),
  expectedResult: z.string().trim().min(5).max(2000),
  assignedTesterId: z.string().trim().max(160).default(""),
});

export const uatResultSchema = z.object({
  status: z.enum(uatStatuses),
  actualResult: z.string().trim().max(3000).default(""),
  evidence: z.string().trim().max(1000).default(""),
  comments: z.string().trim().max(2000).default(""),
  linkedDefectId: z.string().trim().max(160).default(""),
});

export const pilotDecisionSchema = z.object({
  outcome: z.enum(pilotDecisionOutcomes),
  decisionMakers: z.array(z.string().trim().min(1).max(160)).min(1).max(20),
  evidenceReviewed: z.array(z.string().trim().min(3).max(500)).max(30),
  criticalDefects: z.array(z.string().trim().max(160)).max(30),
  acceptedRisks: z.array(z.string().trim().max(1000)).max(30),
  outstandingActions: z.array(z.string().trim().max(1000)).max(30),
  rollbackReady: z.boolean(),
  monitoringReady: z.boolean(),
  approvalEvidence: z.string().trim().max(2000).default(""),
  conditions: z.array(z.string().trim().max(1000)).max(30),
});

export const defaultPilotChecklist = [
  "Pilot owner assigned", "Pilot scope approved", "Participants selected", "Test workspace prepared",
  "User roles verified", "Synthetic data loaded", "Security rules tested", "Tenant isolation tested",
  "Authentication tested", "Backup approach reviewed", "Rollback process documented", "Monitoring enabled",
  "Alerts configured or documented", "Training material available", "Known limitations communicated",
  "Support escalation defined", "UAT scenarios assigned", "Feedback channel ready", "Emergency disablement tested",
  "Feature flags reviewed", "Commercial mode confirmed disabled", "No production customer information present",
  "Technical approval", "Business approval",
] as const;

export const pilotPersonas = [
  { key: "platform-administrator", name: "Platform administrator", permissions: ["pilots.manage", "operations.view", "users.view"], workflows: ["Pilot setup", "Readiness review", "Emergency pause"], restrictions: "Cannot approve their own business decision without a second authorised approver." },
  { key: "tenant-owner", name: "Tenant owner", permissions: ["dashboard.view", "users.view"], workflows: ["Tenant readiness", "Participant review"], restrictions: "Cannot view other tenant records or platform-only operations." },
  { key: "service-desk-manager", name: "Service desk manager", permissions: ["tickets.view", "tickets.assign", "pilots.view"], workflows: ["Ticket triage", "SLA review"], restrictions: "Cannot manage finance, HR, or pilot approvals." },
  { key: "technician", name: "Technician", permissions: ["tickets.view", "tickets.edit", "assets.view"], workflows: ["Resolve ticket", "Asset handover"], restrictions: "Cannot access restricted administration or other tenants." },
  { key: "hr-administrator", name: "HR administrator", permissions: ["employees.view", "attendance.view"], workflows: ["Employee readiness", "Attendance exception"], restrictions: "Cannot view finance or platform secrets." },
  { key: "finance-user", name: "Finance user", permissions: ["finance.dashboard.view", "invoices.view"], workflows: ["Invoice review", "Finance report"], restrictions: "Cannot approve access or view HR-sensitive records." },
  { key: "project-manager", name: "Project manager", permissions: ["projects.view", "projects.create"], workflows: ["Project setup", "Task progress"], restrictions: "Cannot change platform security settings." },
  { key: "employee", name: "Employee", permissions: ["dashboard.view", "tickets.create", "attendance.clock"], workflows: ["Submit request", "Legitimate check-in"], restrictions: "Cannot browse administrative records." },
  { key: "client-contact", name: "Client contact", permissions: ["portal.tickets.view"], workflows: ["Confirm ticket resolution"], restrictions: "Portal scope only; no internal records." },
  { key: "read-only-auditor", name: "Read-only auditor", permissions: ["audit.view", "reports.view"], workflows: ["Review evidence", "Export UAT summary"], restrictions: "Cannot mutate operational or pilot records." },
] as const;

export function syntheticDocumentId(seed: string) {
  return `synthetic-${seed.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function escapeCsvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function assertDemoEnvironment(input: { nodeEnv?: string; projectId?: string; appUrl?: string; firestoreEmulatorHost?: string; approvedNonProduction?: boolean }) {
  const projectId = String(input.projectId ?? "").toLowerCase();
  const production = input.nodeEnv === "production" || /prod(uction)?/.test(projectId) || /(^|\/)production/.test(String(input.appUrl ?? "").toLowerCase());
  if (production) throw new Error("Synthetic demo data is blocked in production environments.");
  if (!input.firestoreEmulatorHost && !input.approvedNonProduction) throw new Error("Synthetic data requires the Firebase Emulator or explicit approved non-production confirmation.");
  return true;
}

export function syntheticSeedRecords(volume: "small" | "medium" = "small") {
  const count = volume === "medium" ? 4 : 2;
  return Array.from({ length: count }, (_, index) => {
    const key = `tenant-${String.fromCharCode(97 + index)}`;
    return { id: syntheticDocumentId(`tenant-${key}`), workspaceId: syntheticDocumentId(key), tenantId: syntheticDocumentId(key), name: `Example ${index === 0 ? "North" : "South"} Services`, domain: `tenant-${key}.example.com`, synthetic: true, seedKey: `phase20:${key}` };
  });
}
