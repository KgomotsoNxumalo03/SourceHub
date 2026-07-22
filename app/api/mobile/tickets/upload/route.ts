import { randomUUID } from "node:crypto";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { authenticateMobileRequest, mobileJsonError } from "@/lib/mobile-auth";
import { buildTicketStoragePath, savePrivateBinaryToStorage, validateUpload } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const { principal } = await authenticateMobileRequest(request);
    if (!principal.permissions.includes("tickets.attach")) return Response.json({ error: "You do not have permission to upload ticket attachments.", code: "ATTACHMENT_ACCESS_REQUIRED" }, { status: 403 });
    const formData = await request.formData();
    const ticketId = String(formData.get("ticketId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ error: "A photo or file is required.", code: "FILE_REQUIRED" }, { status: 400 });
    const ticketReference = await firestoreAdmin.collection(collectionNames.tickets).doc(ticketId).get();
    const ticket = ticketReference.data();
    const isPortal = Boolean(principal.portalClientId);
    if (!ticketReference.exists || ticket?.workspaceId !== principal.workspaceId || (isPortal && ticket?.clientId !== principal.portalClientId)) return Response.json({ error: "Ticket is not available to this mobile user.", code: "TICKET_NOT_FOUND" }, { status: 404 });
    const validationError = validateUpload({ fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, maxBytes: 10 * 1024 * 1024 });
    if (validationError) return Response.json({ error: validationError, code: "FILE_REJECTED" }, { status: 400 });
    const attachmentId = randomUUID();
    const safeName = `${attachmentId}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120)}`;
    const storagePath = buildTicketStoragePath(principal.workspaceId, String(ticket?.referenceNumber ?? ticketId), safeName);
    const stored = await savePrivateBinaryToStorage({ storagePath, buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type || "application/octet-stream" });
    await firestoreAdmin.collection(collectionNames.ticketAttachments).doc(attachmentId).create({ id: attachmentId, workspaceId: principal.workspaceId, ticketId, commentId: null, uploaderId: principal.id, fileName: safeName, originalName: file.name.slice(0, 240), mimeType: file.type || "application/octet-stream", fileSize: file.size, storagePath: stored.storagePath, storageProvider: stored.provider, downloadUrl: `/api/mobile/tickets/attachment/${attachmentId}`, createdAt: new Date(), updatedAt: new Date() });
    return Response.json({ attachment: { id: attachmentId, originalName: file.name, mimeType: file.type, fileSize: file.size, downloadUrl: `/api/mobile/tickets/attachment/${attachmentId}` } });
  } catch (error) { return mobileJsonError(error); }
}
