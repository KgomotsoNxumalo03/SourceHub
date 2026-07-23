import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-errors";
import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { assertEnterpriseWriteAvailable, authenticateEnterpriseApiRequest, EnterpriseApiPrincipal, requireApiScope } from "@/lib/enterprise";

const ticketInput = z.object({
  subject: z.string().trim().min(2).max(240),
  description: z.string().trim().max(10000).default(""),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  clientId: z.string().trim().max(160).optional(),
  siteId: z.string().trim().max(160).optional(),
});

function serialise(value: any): any {
  if (Array.isArray(value)) return value.map(serialise);
  if (value?.toDate) return value.toDate().toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["passwordHash", "bankDetails", "secretHash", "tokenHash"].includes(key))
        .map(([key, child]) => [key, serialise(child)]),
    );
  }
  return value;
}

function response(body: unknown, status: number, correlationId: string) {
  return Response.json(body, { status, headers: { "X-Correlation-Id": correlationId } });
}

export async function GET(request: Request) {
  let principal: EnterpriseApiPrincipal | null = null;
  try {
    principal = await authenticateEnterpriseApiRequest(request);
    requireApiScope(principal, "tickets.read");
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
    const status = url.searchParams.get("status");
    const clientFilter = url.searchParams.get("clientId");
    if (clientFilter && principal.clientIds.length && !principal.clientIds.includes(clientFilter)) throw new Error("The API identity is not permitted for this client.");

    let query: FirebaseFirestore.Query = firestoreAdmin.collection(collectionNames.tickets).where("workspaceId", "==", principal.workspaceId);
    if (status) query = query.where("status", "==", status);
    if (clientFilter) query = query.where("clientId", "==", clientFilter);
    else if (principal.clientIds.length) query = query.where("clientId", "in", principal.clientIds.slice(0, 10));
    query = query.orderBy("updatedAt", "desc").limit(limit + 1);
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      const cursorDocument = await firestoreAdmin.collection(collectionNames.tickets).doc(cursor).get();
      if (cursorDocument.exists && cursorDocument.data()?.workspaceId === principal.workspaceId) query = query.startAfter(cursorDocument);
    }

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > limit;
    const documents = snapshot.docs.slice(0, limit);
    return response({ data: documents.map((doc) => serialise({ id: doc.id, reference: doc.data().referenceNumber, subject: doc.data().subject, description: doc.data().description, status: doc.data().status, priority: doc.data().priority, clientId: doc.data().clientId, siteId: doc.data().siteId, assigneeId: doc.data().assigneeId, updatedAt: doc.data().updatedAt })), pagination: { limit, nextCursor: hasMore ? documents[documents.length - 1]?.id ?? null : null, hasMore } }, 200, principal.correlationId);
  } catch (error) {
    return apiErrorResponse(error, principal?.correlationId ?? "unknown");
  }
}

export async function POST(request: Request) {
  let principal: EnterpriseApiPrincipal | null = null;
  try {
    principal = await authenticateEnterpriseApiRequest(request);
    requireApiScope(principal, "tickets.write");
    await assertEnterpriseWriteAvailable(principal.workspaceId, "tickets");
    const value = ticketInput.parse(await request.json());
    if (value.clientId && principal.clientIds.length && !principal.clientIds.includes(value.clientId)) throw new Error("The API identity is not permitted for this client.");
    if (value.clientId) {
      const client = await firestoreAdmin.collection(collectionNames.clients).doc(value.clientId).get();
      if (!client.exists || client.data()?.workspaceId !== principal.workspaceId) throw new Error("Client not found in the API workspace.");
    }

    const ticketId = randomUUID();
    const sequenceRef = firestoreAdmin.collection(collectionNames.ticketSequences).doc("default");
    let referenceNumber = "";
    await firestoreAdmin.runTransaction(async (transaction) => {
      const sequence = await transaction.get(sequenceRef);
      const currentValue = Number(sequence.data()?.currentValue ?? 0) + 1;
      referenceNumber = `SH-TKT-${String(currentValue).padStart(6, "0")}`;
      transaction.set(sequenceRef, { id: "default", name: "default", currentValue, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.create(firestoreAdmin.collection(collectionNames.tickets).doc(ticketId), { id: ticketId, workspaceId: principal!.workspaceId, referenceNumber, subject: value.subject, description: value.description, status: "NEW", priority: value.priority, clientId: value.clientId ?? null, siteId: value.siteId ?? null, requesterId: principal!.ownerId ?? null, assigneeId: null, categoryId: null, assetId: null, endpointId: null, createdById: principal!.ownerId ?? null, updatedById: principal!.ownerId ?? null, openedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), firstResponseAt: null, resolvedAt: null, closedAt: null });
    });
    return response({ data: { id: ticketId, reference: referenceNumber, status: "NEW" } }, 201, principal.correlationId);
  } catch (error) {
    return apiErrorResponse(error, principal?.correlationId ?? "unknown");
  }
}
