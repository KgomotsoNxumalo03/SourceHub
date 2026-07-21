import { prisma } from "@/lib/db";

export const employeeStatusLabels = {
  PREBOARDING: "Preboarding",
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  SUSPENDED: "Suspended",
  NOTICE_PERIOD: "Notice period",
  TERMINATED: "Terminated",
  FORMER_EMPLOYEE: "Former employee",
  ARCHIVED: "Archived",
} as const;

export const employeeTypeLabels = {
  PERMANENT: "Permanent",
  FIXED_TERM: "Fixed term",
  PART_TIME: "Part time",
  TEMPORARY: "Temporary",
  CONTRACTOR: "Contractor",
  INTERN: "Intern",
  GRADUATE: "Graduate",
  CONSULTANT: "Consultant",
} as const;

const allowedTransitions: Record<string, string[]> = {
  PREBOARDING: ["ACTIVE", "SUSPENDED", "ARCHIVED"],
  ACTIVE: ["ON_LEAVE", "SUSPENDED", "NOTICE_PERIOD", "TERMINATED", "ARCHIVED"],
  ON_LEAVE: ["ACTIVE", "SUSPENDED", "NOTICE_PERIOD", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "ON_LEAVE", "NOTICE_PERIOD", "TERMINATED", "ARCHIVED"],
  NOTICE_PERIOD: ["ACTIVE", "TERMINATED", "FORMER_EMPLOYEE"],
  TERMINATED: ["FORMER_EMPLOYEE", "ARCHIVED"],
  FORMER_EMPLOYEE: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionEmployeeStatus(from: string, to: string) {
  return from === to || (allowedTransitions[from] ?? []).includes(to);
}

export function maskIdentityReference(value?: string | null) {
  if (!value) return null;
  const clean = String(value).trim();
  return clean.length <= 4 ? "••••" : `${"•".repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
}

export function employeeDisplayName(employee: { firstName: string; middleNames?: string | null; lastName: string; preferredName?: string | null }) {
  return [employee.preferredName || employee.firstName, employee.middleNames, employee.lastName].filter(Boolean).join(" ");
}

export function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysUntil(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

export function contractStatus(contract: { status: string; endDate?: Date | string | null }) {
  if (!contract.endDate || ["DRAFT", "PENDING_SIGNATURE", "CANCELLED", "TERMINATED", "RENEWED"].includes(contract.status)) return contract.status;
  const days = daysUntil(contract.endDate);
  if (days != null && days < 0) return "EXPIRED";
  if (days != null && days <= 60) return "EXPIRING_SOON";
  return contract.status === "EXPIRED" ? "EXPIRED" : contract.status;
}

export async function ensureEmployeeInWorkspace(employeeId: string, workspaceId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  return employee && employee.workspaceId === workspaceId ? employee : null;
}

export async function hasReportingLoop(employeeId: string, managerId: string | null, workspaceId: string) {
  if (!managerId) return false;
  if (employeeId === managerId) return true;
  const visited = new Set<string>([employeeId]);
  let currentId: string | null = managerId;
  for (let depth = 0; currentId && depth < 100; depth += 1) {
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    const current = await ensureEmployeeInWorkspace(currentId, workspaceId);
    if (!current) return false;
    currentId = current.managerId ?? null;
  }
  return Boolean(currentId);
}

export function isSensitiveEmployeeField(field: string) {
  return ["identityReference", "personalEmail", "alternativePhone", "internalNotes", "compensationSummary", "terminationReason"].includes(field);
}
