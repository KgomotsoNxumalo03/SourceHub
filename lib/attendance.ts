import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { attendanceWorkModes } from "@/lib/validators";

export const attendanceWorkModeLabels = {
  OFFICE: "Office",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  CLIENT_SITE: "Client site",
  FIELD_WORK: "Field work",
  BUSINESS_TRAVEL: "Business travel",
  TRAINING: "Training",
  OTHER: "Other",
} as const;

export const attendanceLocationTypeLabels = {
  HEAD_OFFICE: "Head office",
  BRANCH_OFFICE: "Branch office",
  CLIENT_SITE: "Client site",
  REMOTE: "Remote",
  HOME_OFFICE: "Home office",
  TEMPORARY_SITE: "Temporary site",
  OTHER: "Other",
} as const;

export const breakTypeLabels = { MEAL: "Meal break", SHORT: "Short break", PERSONAL: "Personal break", MEDICAL: "Medical break", OTHER: "Other" } as const;

export function attendanceDayKey(date = new Date(), timeZone = env.DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function serverDate(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function elapsedMinutes(start: unknown, end: unknown = new Date()) {
  const startDate = serverDate(start);
  const endDate = serverDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 60000));
}

export function roundedMinutes(minutes: number, rounding = 1) {
  if (rounding <= 1) return minutes;
  return Math.round(minutes / rounding) * rounding;
}

export async function employeeForAttendance(user: { id: string; employeeNumber: string }) {
  const linked = await prisma.employee.findFirst({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, userId: user.id } });
  if (linked) return linked;
  return prisma.employee.findFirst({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, employeeNumber: user.employeeNumber } });
}

export async function resolveAttendanceProfile(employee: any) {
  const profiles = await prisma.attendanceProfile.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, active: true }, take: 200 });
  const score = (profile: any) => {
    if (profile.employeeId === employee.id) return 50;
    if (profile.teamId && profile.teamId === employee.teamId) return 40;
    if (profile.departmentId && profile.departmentId === employee.departmentId) return 30;
    if (profile.employmentType && profile.employmentType === employee.employmentType) return 20;
    if (profile.scopeType === "WORKSPACE" || (!profile.employeeId && !profile.teamId && !profile.departmentId && !profile.employmentType)) return 10;
    return 0;
  };
  return profiles.sort((left: any, right: any) => score(right) - score(left))[0] ?? null;
}

export async function activeAttendanceSession(employeeId: string) {
  return prisma.attendanceSession.findFirst({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, employeeId, status: "ACTIVE" }, orderBy: { startedAt: "desc" } });
}

export function allowedMode(profile: any, workMode: string) {
  const modes = Array.isArray(profile?.allowedWorkModes) && profile.allowedWorkModes.length > 0 ? profile.allowedWorkModes : attendanceWorkModes;
  return modes.includes(workMode);
}

export function requiresLocation(profile: any, location: any, workMode: string) {
  return Boolean(profile?.locationVerificationRequired || location?.verificationPolicy === "REQUIRED" || (profile?.officeRequired && workMode === "OFFICE"));
}

export function attendancePulseOneBoundary() {
  return {
    version: "1",
    description: "Optional future adapter for approved attendance summaries only. No productivity, application, browser, idle, or surveillance data is accepted.",
    acceptedFields: ["employeeId", "attendanceDate", "workedMinutes", "workMode"],
  } as const;
}
