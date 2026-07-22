import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { authenticateMobileRequest, mobileJsonError } from "@/lib/mobile-auth";
import { processTrustedMobileOperation } from "@/lib/mobile-workflows";
import { mobileSyncSchema } from "@/lib/validators-mobile";

function requirePermission(permissions: string[], permission: string) { if (!permissions.includes(permission)) throw new Error(`Missing permission: ${permission}`); }

async function processOperation(principal: any, operation: any) {
  const idempotencyId = `${principal.workspaceId}:${principal.id}:${operation.idempotencyKey}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 500);
  const idempotencyReference = firestoreAdmin.collection(collectionNames.mobileSyncOperations).doc(idempotencyId);
  const existing = await idempotencyReference.get();
  if (existing.exists) return { idempotencyKey: operation.idempotencyKey, status: existing.data()?.status ?? "COMPLETED", result: existing.data()?.result ?? null };
  const payload = operation.payload ?? {};
  let result: Record<string, unknown> = {};
  if (["ticket.reply", "ticket.note", "ticket.update"].includes(operation.type)) {
    const ticketId = String(payload.ticketId ?? "");
    const ticketDocument = await firestoreAdmin.collection(collectionNames.tickets).doc(ticketId).get();
    const ticket = ticketDocument.data() ?? {};
    const isPortal = Boolean(principal.portalClientId);
    if (!ticketDocument.exists || ticket?.workspaceId !== principal.workspaceId || (isPortal && ticket.clientId !== principal.portalClientId)) throw new Error("Ticket is not available to this mobile user.");
    if (operation.type === "ticket.reply" || operation.type === "ticket.note") {
      if (operation.type === "ticket.note") requirePermission(principal.permissions, "tickets.note");
      if (operation.type === "ticket.reply" && !isPortal) requirePermission(principal.permissions, "tickets.reply");
      const visibility = operation.type === "ticket.note" && !isPortal ? "internal" : "public";
      const commentId = randomUUID();
      await firestoreAdmin.collection(collectionNames.ticketComments).doc(commentId).create({ id: commentId, workspaceId: principal.workspaceId, ticketId, authorId: principal.id, body: String(payload.body ?? "").trim().slice(0, 10000), visibility, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      result = { commentId, confirmedByServer: true };
    } else {
      requirePermission(principal.permissions, "tickets.update");
      const allowed: Record<string, unknown> = {};
      if (payload.status && ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"].includes(String(payload.status))) allowed.status = payload.status;
      if (payload.priority && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(String(payload.priority))) allowed.priority = payload.priority;
      if (!Object.keys(allowed).length) throw new Error("No approved ticket fields were supplied.");
      await ticketDocument.ref.update({ ...allowed, updatedById: principal.id, updatedAt: FieldValue.serverTimestamp() });
      result = { ticketId, updatedFields: Object.keys(allowed), confirmedByServer: true };
    }
  } else if (operation.type === "notification.read") {
    const notificationId = String(payload.notificationId ?? "");
    const notification = await firestoreAdmin.collection(collectionNames.notifications).doc(notificationId).get();
    if (!notification.exists || notification.data()?.workspaceId !== principal.workspaceId || notification.data()?.userId !== principal.id) throw new Error("Notification is not available to this mobile user.");
    await notification.ref.update({ readAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    result = { notificationId, confirmedByServer: true };
  } else {
    result = await processTrustedMobileOperation(principal, operation);
  }
  await idempotencyReference.create({ id: idempotencyId, workspaceId: principal.workspaceId, userId: principal.id, operationType: operation.type, status: "COMPLETED", result, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 30 * 86400000) });
  return { idempotencyKey: operation.idempotencyKey, status: "COMPLETED", result };
}

export async function POST(request: Request) {
  try {
    const { principal } = await authenticateMobileRequest(request);
    const input = mobileSyncSchema.parse(await request.json());
    const results: Array<Record<string, unknown>> = [];
    for (const operation of input.operations) {
      try { results.push(await processOperation(principal, operation)); } catch (error: any) { results.push({ idempotencyKey: operation.idempotencyKey, status: "FAILED", error: String(error?.message ?? "Operation failed") }); }
    }
    return Response.json({ results });
  } catch (error) { return mobileJsonError(error); }
}
