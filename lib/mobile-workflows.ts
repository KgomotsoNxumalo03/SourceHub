import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";

type MobileActor = { id: string; workspaceId: string; permissions: string[]; mobilePermissions: string[] };
type MobileOperation = { type: string; payload?: Record<string, unknown> };

function requirePermission(actor: MobileActor, permission: string) {
  if (!actor.permissions.includes(permission) && !actor.mobilePermissions.includes(permission)) throw new Error(`Missing permission: ${permission}`);
}

function stringValue(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }

async function attendanceOperation(actor: MobileActor, operation: MobileOperation, payload: Record<string, unknown>) {
  requirePermission(actor, "mobile.attendance.use");
  const employeeSnapshot = await firestoreAdmin.collection(collectionNames.employees).where("workspaceId", "==", actor.workspaceId).where("userId", "==", actor.id).limit(1).get();
  if (employeeSnapshot.empty) throw new Error("Your SourceHub account is not linked to an employee attendance record.");
  const employee = employeeSnapshot.docs[0];
  const employeeId = employee.id;
  const lockRef = firestoreAdmin.collection(collectionNames.attendanceLocks).doc(`${actor.workspaceId}:${employeeId}`);
  const mode = stringValue(payload.workMode, 40).toUpperCase();
  if (operation.type !== "attendance.break_start" && operation.type !== "attendance.break_end" && !["OFFICE", "REMOTE", "CLIENT_SITE", "FIELD_WORK"].includes(mode)) throw new Error("Select an approved work mode.");
  const idempotencyRef = firestoreAdmin.collection(collectionNames.attendanceIdempotency).doc(`${actor.workspaceId}:mobile:${stringValue(payload.idempotencyKey, 120)}`);
  const eventId = randomUUID();
  let result: Record<string, unknown> = { confirmedByServer: true };
  await firestoreAdmin.runTransaction(async (transaction) => {
    const [lock, previous] = await Promise.all([transaction.get(lockRef), transaction.get(idempotencyRef)]);
    if (previous.exists) { result = { ...result, replayed: true, ...previous.data() }; return; }
    const lockData = lock.data() ?? {};
    if (operation.type === "attendance.clock_in") {
      if (lockData.status === "ACTIVE") throw new Error("You are already clocked in.");
      const sessionId = randomUUID();
      transaction.set(lockRef, { workspaceId: actor.workspaceId, employeeId, status: "ACTIVE", sessionId, activeBreakId: null, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(firestoreAdmin.collection(collectionNames.attendanceSessions).doc(sessionId), { id: sessionId, workspaceId: actor.workspaceId, employeeId, status: "ACTIVE", startedAt: FieldValue.serverTimestamp(), endedAt: null, workMode: mode, locationId: stringValue(payload.locationId, 160) || null, timeZone: "Africa/Johannesburg", source: "MOBILE", totalWorkedMinutes: 0, createdBy: actor.id, updatedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(firestoreAdmin.collection(collectionNames.attendanceEvents).doc(eventId), { id: eventId, workspaceId: actor.workspaceId, employeeId, sessionId, eventType: "CLOCK_IN", serverTimestamp: FieldValue.serverTimestamp(), employeeDisplayedTime: new Date().toISOString(), workMode: mode, locationId: stringValue(payload.locationId, 160) || null, source: "MOBILE", verificationState: "NOT_REQUIRED", note: stringValue(payload.note, 1000) || null, createdBy: actor.id, createdAt: FieldValue.serverTimestamp() });
      result = { ...result, sessionId, eventId };
    } else if (operation.type === "attendance.clock_out") {
      if (lockData.status !== "ACTIVE") throw new Error("You are not currently clocked in.");
      if (lockData.activeBreakId) throw new Error("End your active break before clocking out.");
      const sessionId = stringValue(lockData.sessionId, 160);
      transaction.update(firestoreAdmin.collection(collectionNames.attendanceSessions).doc(sessionId), { status: "CLOSED", endedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.id });
      transaction.set(firestoreAdmin.collection(collectionNames.attendanceEvents).doc(eventId), { id: eventId, workspaceId: actor.workspaceId, employeeId, sessionId, eventType: "CLOCK_OUT", serverTimestamp: FieldValue.serverTimestamp(), employeeDisplayedTime: new Date().toISOString(), source: "MOBILE", verificationState: "NOT_REQUIRED", note: stringValue(payload.note, 1000) || null, createdBy: actor.id, createdAt: FieldValue.serverTimestamp() });
      transaction.delete(lockRef);
      result = { ...result, sessionId, eventId };
    } else if (operation.type === "attendance.break_start") {
      if (lockData.status !== "ACTIVE") throw new Error("You must be clocked in before starting a break.");
      if (lockData.activeBreakId) throw new Error("You already have an active break.");
      const breakId = randomUUID();
      const sessionId = stringValue(lockData.sessionId, 160);
      transaction.update(lockRef, { activeBreakId: breakId, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(firestoreAdmin.collection(collectionNames.attendanceBreaks).doc(breakId), { id: breakId, workspaceId: actor.workspaceId, employeeId, sessionId, status: "ACTIVE", breakType: stringValue(payload.breakType, 40).toUpperCase() || "MEAL", startedAt: FieldValue.serverTimestamp(), endedAt: null, durationMinutes: 0, paid: false, note: stringValue(payload.note, 500) || null, createdBy: actor.id, updatedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(firestoreAdmin.collection(collectionNames.attendanceEvents).doc(eventId), { id: eventId, workspaceId: actor.workspaceId, employeeId, sessionId, breakId, eventType: "BREAK_START", serverTimestamp: FieldValue.serverTimestamp(), source: "MOBILE", note: stringValue(payload.note, 500) || null, createdBy: actor.id, createdAt: FieldValue.serverTimestamp() });
      result = { ...result, breakId, eventId };
    } else if (operation.type === "attendance.break_end") {
      if (lockData.status !== "ACTIVE" || !lockData.activeBreakId) throw new Error("You do not have an active break.");
      const breakId = stringValue(lockData.activeBreakId, 160);
      const sessionId = stringValue(lockData.sessionId, 160);
      transaction.update(firestoreAdmin.collection(collectionNames.attendanceBreaks).doc(breakId), { status: "CLOSED", endedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.id });
      transaction.set(firestoreAdmin.collection(collectionNames.attendanceEvents).doc(eventId), { id: eventId, workspaceId: actor.workspaceId, employeeId, sessionId, breakId, eventType: "BREAK_END", serverTimestamp: FieldValue.serverTimestamp(), source: "MOBILE", createdBy: actor.id, createdAt: FieldValue.serverTimestamp() });
      transaction.update(lockRef, { activeBreakId: null, updatedAt: FieldValue.serverTimestamp() });
      result = { ...result, breakId, eventId };
    }
    transaction.create(idempotencyRef, { workspaceId: actor.workspaceId, employeeId, action: operation.type, result, createdAt: FieldValue.serverTimestamp() });
  });
  return result;
}

export async function processTrustedMobileOperation(actor: MobileActor, operation: MobileOperation) {
  const payload = operation.payload ?? {};
  if (operation.type.startsWith("attendance.")) return attendanceOperation(actor, operation, payload);
  if (operation.type === "task.update") {
    requirePermission(actor, "mobile.projects.use");
    const taskRef = firestoreAdmin.collection(collectionNames.projectTasks).doc(stringValue(payload.taskId, 160));
    const task = await taskRef.get();
    if (!task.exists || task.data()?.workspaceId !== actor.workspaceId) throw new Error("Task is not available to this mobile user.");
    if (task.data()?.assigneeId !== actor.id && !actor.permissions.includes("project_tasks.manage")) throw new Error("You are not assigned to this task.");
    const status = stringValue(payload.status, 40).toUpperCase();
    const allowedStatuses = ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "WAITING", "COMPLETED", "CANCELLED"];
    if (!allowedStatuses.includes(status)) throw new Error("That task status is not supported.");
    await taskRef.update({ status, progressPercentage: status === "COMPLETED" ? 100 : task.data()?.progressPercentage ?? 0, completedDate: status === "COMPLETED" ? FieldValue.serverTimestamp() : null, updatedBy: actor.id, updatedAt: FieldValue.serverTimestamp() });
    return { taskId: taskRef.id, status, confirmedByServer: true };
  }
  if (operation.type === "maintenance.create") {
    requirePermission(actor, "mobile.assets.manage");
    const assetRef = firestoreAdmin.collection(collectionNames.assets).doc(stringValue(payload.assetId, 160));
    const asset = await assetRef.get();
    if (!asset.exists || asset.data()?.workspaceId !== actor.workspaceId) throw new Error("Asset is not available to this mobile user.");
    const maintenanceId = randomUUID();
    await firestoreAdmin.collection(collectionNames.assetMaintenance).doc(maintenanceId).create({ id: maintenanceId, workspaceId: actor.workspaceId, assetId: assetRef.id, maintenanceType: stringValue(payload.maintenanceType, 60) || "OTHER", description: stringValue(payload.description, 2000), technicianId: actor.id, startDate: new Date(), completionDate: null, cost: stringValue(payload.cost, 80) || null, currency: stringValue(payload.currency, 10) || null, partsReplaced: stringValue(payload.partsReplaced, 1000), downtimeMinutes: Number(payload.downtimeMinutes ?? 0) || 0, outcome: stringValue(payload.outcome, 1000) || null, nextServiceDate: null, notes: stringValue(payload.notes, 2000) || null, createdById: actor.id, updatedById: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { maintenanceId, assetId: assetRef.id, confirmedByServer: true };
  }
  throw new Error("This mobile operation is not supported.");
}
