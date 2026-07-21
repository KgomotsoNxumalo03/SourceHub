"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";

import { currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { firestoreAdmin, prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { attendanceActionSchema, attendanceProfileSchema, breakActionSchema, workLocationSchema, workScheduleSchema } from "@/lib/validators";
import { activeAttendanceSession, allowedMode, employeeForAttendance, requiresLocation, resolveAttendanceProfile, serverDate } from "@/lib/attendance";

const workspaceId = env.DEFAULT_WORKSPACE_ID;

function fail(path: string, message: string): never { redirect(`${path}?error=${encodeURIComponent(message)}`); }
function ipAddress() { return headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers().get("x-real-ip") ?? null; }

async function actorFor(permission: string) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes(permission)) redirect("/access-denied");
  return actor;
}

async function attendanceActor() {
  const actor = await actorFor("attendance.clock");
  const employee = await employeeForAttendance(actor);
  if (!employee) fail("/attendance", "Your SourceHub user is not linked to an employee attendance record.");
  return { actor, employee };
}

async function validateAction(formData: FormData, employee: any) {
  const profile = await resolveAttendanceProfile(employee);
  const parsed = attendanceActionSchema.safeParse({ workMode: formData.get("workMode"), locationId: formData.get("locationId"), note: formData.get("note"), idempotencyKey: formData.get("idempotencyKey"), verificationState: "NOT_REQUIRED", distanceMetres: undefined });
  if (!parsed.success) fail("/attendance", parsed.error.issues[0]?.message ?? "Please review the attendance action.");
  if (!allowedMode(profile, parsed.data.workMode)) fail("/attendance", "That work mode is not allowed by your attendance profile.");
  const location = parsed.data.locationId ? await prisma.workLocation.findUnique({ where: { id: parsed.data.locationId } }) : null;
  if (parsed.data.locationId && (!location || location.workspaceId !== workspaceId || !location.active)) fail("/attendance", "The selected work location is not available.");
  if (location && parsed.data.workMode === "OFFICE" && location.classification !== "OFFICE") fail("/attendance", "Office attendance requires an office-classified location.");
  const locationRequired = requiresLocation(profile, location, parsed.data.workMode);
  return { data: parsed.data, profile, location, locationRequired };
}

async function createLocationException(employeeId: string, action: string, actorId: string, note?: string | null) {
  return prisma.attendanceException.create({ data: { workspaceId, employeeId, exceptionType: "LOCATION_VERIFICATION", status: "OPEN", action, reason: note || "Location verification was unavailable at attendance action time.", source: "ATTENDANCE_ACTION", requiresApproval: true, createdBy: actorId, updatedBy: actorId, createdAt: new Date(), updatedAt: new Date() } });
}

export async function clockInAction(formData: FormData) {
  const { actor, employee } = await attendanceActor();
  const { data, location, locationRequired } = await validateAction(formData, employee);
  const now = new Date();
  const sessionId = randomUUID();
  const eventId = randomUUID();
  const idempotencyKey = `${workspaceId}:clock-in:${data.idempotencyKey}`;
  const lockRef = firestoreAdmin.collection("attendanceLocks").doc(`${workspaceId}:${employee.id}`);
  const idempotencyRef = firestoreAdmin.collection("attendanceIdempotency").doc(idempotencyKey);
  await firestoreAdmin.runTransaction(async (transaction) => {
    const [lock, previous] = await Promise.all([transaction.get(lockRef), transaction.get(idempotencyRef)]);
    if (previous.exists) return;
    if (lock.exists && lock.data()?.status === "ACTIVE") throw new Error("ATTENDANCE_ALREADY_ACTIVE");
    transaction.set(lockRef, { workspaceId, employeeId: employee.id, status: "ACTIVE", sessionId, activeBreakId: null, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(firestoreAdmin.collection("attendanceSessions").doc(sessionId), { id: sessionId, workspaceId, employeeId: employee.id, status: "ACTIVE", startedAt: FieldValue.serverTimestamp(), endedAt: null, workMode: data.workMode, locationId: location?.id ?? null, timeZone: location?.timeZone ?? env.DEFAULT_TIMEZONE, source: "WEB", totalWorkedMinutes: 0, createdBy: actor.id, updatedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(firestoreAdmin.collection("attendanceEvents").doc(eventId), { id: eventId, workspaceId, employeeId: employee.id, sessionId, eventType: "CLOCK_IN", serverTimestamp: FieldValue.serverTimestamp(), employeeDisplayedTime: now.toISOString(), timeZone: location?.timeZone ?? env.DEFAULT_TIMEZONE, workMode: data.workMode, locationId: location?.id ?? null, source: "WEB", verificationState: locationRequired ? "UNAVAILABLE" : "NOT_REQUIRED", note: data.note || null, createdBy: actor.id, createdAt: FieldValue.serverTimestamp() });
    transaction.create(idempotencyRef, { workspaceId, employeeId: employee.id, action: "CLOCK_IN", sessionId, eventId, createdAt: FieldValue.serverTimestamp() });
  }).catch((error: any) => { if (error?.message === "ATTENDANCE_ALREADY_ACTIVE") fail("/attendance", "You are already clocked in."); throw error; });
  if (locationRequired) await createLocationException(employee.id, "CLOCK_IN", actor.id, data.note);
  await logAudit({ userId: actor.id, action: "attendance.clock_in", entityType: "AttendanceSession", entityId: sessionId, metadata: { employeeId: employee.id, workMode: data.workMode, locationId: location?.id ?? null, verificationState: locationRequired ? "UNAVAILABLE" : "NOT_REQUIRED" }, ipAddress: ipAddress() });
  revalidatePath("/attendance");
  redirect("/attendance?clockedIn=1");
}

export async function clockOutAction(formData: FormData) {
  const { actor, employee } = await attendanceActor();
  const { data, location, locationRequired } = await validateAction(formData, employee);
  const lockRef = firestoreAdmin.collection("attendanceLocks").doc(`${workspaceId}:${employee.id}`);
  const lock = await lockRef.get();
  if (!lock.exists || lock.data()?.status !== "ACTIVE") fail("/attendance", "You are not currently clocked in.");
  if (lock.data()?.activeBreakId) fail("/attendance", "End your active break before clocking out.");
  const sessionId = String(lock.data()?.sessionId ?? "");
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session || session.workspaceId !== workspaceId || session.employeeId !== employee.id || session.status !== "ACTIVE") fail("/attendance", "The active attendance session could not be verified.");
  const eventId = randomUUID();
  const now = new Date();
  await firestoreAdmin.runTransaction(async (transaction) => {
    const currentLock = await transaction.get(lockRef);
    if (!currentLock.exists || currentLock.data()?.status !== "ACTIVE" || currentLock.data()?.sessionId !== sessionId) throw new Error("ATTENDANCE_SESSION_CHANGED");
    transaction.update(firestoreAdmin.collection("attendanceSessions").doc(sessionId), { status: "CLOSED", endedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.id });
    transaction.set(firestoreAdmin.collection("attendanceEvents").doc(eventId), { id: eventId, workspaceId, employeeId: employee.id, sessionId, eventType: "CLOCK_OUT", serverTimestamp: FieldValue.serverTimestamp(), employeeDisplayedTime: now.toISOString(), timeZone: location?.timeZone ?? session.timeZone ?? env.DEFAULT_TIMEZONE, workMode: data.workMode || session.workMode, locationId: location?.id ?? session.locationId ?? null, source: "WEB", verificationState: locationRequired ? "UNAVAILABLE" : "NOT_REQUIRED", note: data.note || null, createdBy: actor.id, createdAt: FieldValue.serverTimestamp() });
    transaction.delete(lockRef);
  }).catch((error: any) => { if (error?.message === "ATTENDANCE_SESSION_CHANGED") fail("/attendance", "This attendance session changed in another browser tab. Refresh and try again."); throw error; });
  if (locationRequired) await createLocationException(employee.id, "CLOCK_OUT", actor.id, data.note);
  await logAudit({ userId: actor.id, action: "attendance.clock_out", entityType: "AttendanceSession", entityId: sessionId, metadata: { employeeId: employee.id }, ipAddress: ipAddress() });
  revalidatePath("/attendance");
  redirect("/attendance?clockedOut=1");
}

export async function startBreakAction(formData: FormData) {
  const { actor, employee } = await attendanceActor();
  const parsed = breakActionSchema.safeParse({ breakType: formData.get("breakType"), note: formData.get("note"), idempotencyKey: formData.get("idempotencyKey") });
  if (!parsed.success) fail("/attendance", parsed.error.issues[0]?.message ?? "Please review the break.");
  const lockRef = firestoreAdmin.collection("attendanceLocks").doc(`${workspaceId}:${employee.id}`);
  const lock = await lockRef.get();
  if (!lock.exists || lock.data()?.status !== "ACTIVE") fail("/attendance", "You must be clocked in before starting a break.");
  if (lock.data()?.activeBreakId) fail("/attendance", "You already have an active break.");
  const breakId = randomUUID();
  const eventId = randomUUID();
  const idem = firestoreAdmin.collection("attendanceIdempotency").doc(`${workspaceId}:break-start:${parsed.data.idempotencyKey}`);
  await firestoreAdmin.runTransaction(async (transaction) => {
    const [currentLock, previous] = await Promise.all([transaction.get(lockRef), transaction.get(idem)]);
    if (previous.exists) return;
    if (!currentLock.exists || currentLock.data()?.status !== "ACTIVE") throw new Error("NO_ACTIVE_SESSION");
    if (currentLock.data()?.activeBreakId) throw new Error("BREAK_ALREADY_ACTIVE");
    const sessionId = String(currentLock.data()?.sessionId);
    transaction.update(lockRef, { activeBreakId: breakId, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(firestoreAdmin.collection("attendanceBreaks").doc(breakId), { id: breakId, workspaceId, employeeId: employee.id, sessionId, status: "ACTIVE", breakType: parsed.data.breakType, startedAt: FieldValue.serverTimestamp(), endedAt: null, durationMinutes: 0, paid: false, note: parsed.data.note || null, createdBy: actor.id, updatedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(firestoreAdmin.collection("attendanceEvents").doc(eventId), { id: eventId, workspaceId, employeeId: employee.id, sessionId, breakId, eventType: "BREAK_START", serverTimestamp: FieldValue.serverTimestamp(), source: "WEB", note: parsed.data.note || null, createdBy: actor.id, createdAt: FieldValue.serverTimestamp() });
    transaction.create(idem, { workspaceId, employeeId: employee.id, action: "BREAK_START", breakId, eventId, createdAt: FieldValue.serverTimestamp() });
  }).catch((error: any) => { if (error?.message === "NO_ACTIVE_SESSION") fail("/attendance", "You must be clocked in before starting a break."); if (error?.message === "BREAK_ALREADY_ACTIVE") fail("/attendance", "You already have an active break."); throw error; });
  await logAudit({ userId: actor.id, action: "attendance.break_start", entityType: "AttendanceBreak", entityId: breakId, metadata: { employeeId: employee.id, breakType: parsed.data.breakType }, ipAddress: ipAddress() });
  revalidatePath("/attendance"); redirect("/attendance?breakStarted=1");
}

export async function endBreakAction(formData: FormData) {
  const { actor, employee } = await attendanceActor();
  const lockRef = firestoreAdmin.collection("attendanceLocks").doc(`${workspaceId}:${employee.id}`);
  const lock = await lockRef.get();
  const breakId = String(lock.data()?.activeBreakId ?? "");
  if (!lock.exists || !breakId) fail("/attendance", "You do not have an active break.");
  const breakRecord = await prisma.attendanceBreak.findUnique({ where: { id: breakId } });
  if (!breakRecord || breakRecord.employeeId !== employee.id || breakRecord.status !== "ACTIVE") fail("/attendance", "The active break could not be verified.");
  const eventId = randomUUID();
  await firestoreAdmin.runTransaction(async (transaction) => {
    const currentLock = await transaction.get(lockRef);
    if (!currentLock.exists || currentLock.data()?.activeBreakId !== breakId) throw new Error("BREAK_CHANGED");
    transaction.update(firestoreAdmin.collection("attendanceBreaks").doc(breakId), { status: "CLOSED", endedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.id });
    transaction.set(firestoreAdmin.collection("attendanceEvents").doc(eventId), { id: eventId, workspaceId, employeeId: employee.id, sessionId: breakRecord.sessionId, breakId, eventType: "BREAK_END", serverTimestamp: FieldValue.serverTimestamp(), source: "WEB", createdBy: actor.id, createdAt: FieldValue.serverTimestamp() });
    transaction.update(lockRef, { activeBreakId: null, updatedAt: FieldValue.serverTimestamp() });
  }).catch((error: any) => { if (error?.message === "BREAK_CHANGED") fail("/attendance", "This break changed in another browser tab. Refresh and try again."); throw error; });
  await logAudit({ userId: actor.id, action: "attendance.break_end", entityType: "AttendanceBreak", entityId: breakId, metadata: { employeeId: employee.id }, ipAddress: ipAddress() });
  revalidatePath("/attendance"); redirect("/attendance?breakEnded=1");
}

function formValue(formData: FormData, name: string) { return formData.get(name); }
export async function createAttendanceProfileAction(formData: FormData) {
  const actor = await actorFor("attendance.profiles.manage");
  const parsed = attendanceProfileSchema.safeParse({ name: formValue(formData, "name"), description: formValue(formData, "description"), standardWorkingDays: formData.getAll("standardWorkingDays"), standardStartTime: formValue(formData, "standardStartTime"), standardEndTime: formValue(formData, "standardEndTime"), expectedDailyHours: formValue(formData, "expectedDailyHours"), expectedWeeklyHours: formValue(formData, "expectedWeeklyHours"), breakEntitlementMinutes: formValue(formData, "breakEntitlementMinutes"), breakPaid: formData.get("breakPaid") === "true", lateGraceMinutes: formValue(formData, "lateGraceMinutes"), earlyDepartureGraceMinutes: formValue(formData, "earlyDepartureGraceMinutes"), overtimeAfterDailyHours: formValue(formData, "overtimeAfterDailyHours"), overtimeMultiplier: formValue(formData, "overtimeMultiplier"), roundingMinutes: formValue(formData, "roundingMinutes"), allowedWorkModes: formData.getAll("allowedWorkModes"), officeRequired: formData.get("officeRequired") === "true", locationVerificationRequired: formData.get("locationVerificationRequired") === "true", manualEntryAllowed: formData.get("manualEntryAllowed") === "true", submissionFrequency: formValue(formData, "submissionFrequency"), active: formData.get("active") !== "false" });
  if (!parsed.success) fail("/attendance/settings", parsed.error.issues[0]?.message ?? "Please review the attendance profile.");
  const data = parsed.data;
  const record = await prisma.attendanceProfile.create({ data: { workspaceId, ...data, scopeType: "WORKSPACE", description: data.description || null, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "attendance.profile_created", entityType: "AttendanceProfile", entityId: record.id, newValues: { name: data.name }, ipAddress: ipAddress() });
  revalidatePath("/attendance"); revalidatePath("/attendance/settings"); redirect("/attendance/settings?profileCreated=1");
}

export async function createWorkLocationAction(formData: FormData) {
  const actor = await actorFor("attendance.locations.manage");
  const parsed = workLocationSchema.safeParse({ name: formValue(formData, "name"), locationType: formValue(formData, "locationType"), address: formValue(formData, "address"), timeZone: formValue(formData, "timeZone"), classification: formValue(formData, "classification"), latitude: formValue(formData, "latitude") || undefined, longitude: formValue(formData, "longitude") || undefined, geofenceRadiusMetres: formValue(formData, "geofenceRadiusMetres") || undefined, allowedNetworks: formValue(formData, "allowedNetworks"), verificationPolicy: formValue(formData, "verificationPolicy"), active: true });
  if (!parsed.success) fail("/attendance/settings", parsed.error.issues[0]?.message ?? "Please review the work location.");
  const data = parsed.data;
  const record = await prisma.workLocation.create({ data: { workspaceId, ...data, address: data.address || null, allowedNetworks: data.allowedNetworks ? data.allowedNetworks.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) : [], createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "attendance.location_created", entityType: "WorkLocation", entityId: record.id, newValues: { name: data.name, verificationPolicy: data.verificationPolicy }, ipAddress: ipAddress() });
  revalidatePath("/attendance"); revalidatePath("/attendance/settings"); redirect("/attendance/settings?locationCreated=1");
}

export async function createWorkScheduleAction(formData: FormData) {
  const actor = await actorFor("attendance.schedules.manage");
  const parsed = workScheduleSchema.safeParse({ name: formValue(formData, "name"), description: formValue(formData, "description"), timeZone: formValue(formData, "timeZone"), workingDays: formData.getAll("workingDays"), startTime: formValue(formData, "startTime"), endTime: formValue(formData, "endTime"), expectedDailyHours: formValue(formData, "expectedDailyHours"), breakMinutes: formValue(formData, "breakMinutes"), flexibleMinutes: formValue(formData, "flexibleMinutes"), coreStartTime: formValue(formData, "coreStartTime"), coreEndTime: formValue(formData, "coreEndTime"), overnight: formData.get("overnight") === "true", effectiveStartDate: formValue(formData, "effectiveStartDate"), effectiveEndDate: formValue(formData, "effectiveEndDate"), active: true });
  if (!parsed.success) fail("/attendance/settings", parsed.error.issues[0]?.message ?? "Please review the work schedule.");
  const data = parsed.data;
  const record = await prisma.workSchedule.create({ data: { workspaceId, ...data, description: data.description || null, coreStartTime: data.coreStartTime || null, coreEndTime: data.coreEndTime || null, effectiveEndDate: data.effectiveEndDate ? new Date(data.effectiveEndDate) : null, effectiveStartDate: new Date(data.effectiveStartDate), createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "attendance.schedule_created", entityType: "WorkSchedule", entityId: record.id, newValues: { name: data.name }, ipAddress: ipAddress() });
  revalidatePath("/attendance/settings"); redirect("/attendance/settings?scheduleCreated=1");
}

export async function createAttendanceExceptionAction(formData: FormData) {
  const actor = await actorFor("attendance.exceptions.manage");
  const employeeId = String(formData.get("employeeId") ?? "");
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.workspaceId !== workspaceId) fail("/attendance/reports", "Employee not found.");
  const record = await prisma.attendanceException.create({ data: { workspaceId, employeeId, exceptionType: String(formData.get("exceptionType") || "OTHER"), status: "OPEN", action: "MANUAL", reason: String(formData.get("reason") || "").trim() || "Attendance exception submitted for review.", source: "MANUAL", requiresApproval: true, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "attendance.exception_created", entityType: "AttendanceException", entityId: record.id, metadata: { employeeId }, ipAddress: ipAddress() });
  revalidatePath("/attendance/reports"); redirect("/attendance/reports?exceptionCreated=1");
}
