import { getStorage } from "firebase-admin/storage";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { collectionNames } from "@/lib/collections";
import { adminApp, firestoreAdmin } from "@/lib/db";
import { authenticateMobileRequest, mobileJsonError } from "@/lib/mobile-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { principal } = await authenticateMobileRequest(request);
    const { id } = await params;
    const document = await firestoreAdmin.collection(collectionNames.ticketAttachments).doc(id).get();
    const attachment = document.data();
    if (!document.exists || attachment?.workspaceId !== principal.workspaceId) return Response.json({ error: "Attachment not found.", code: "ATTACHMENT_NOT_FOUND" }, { status: 404 });
    const ticket = await firestoreAdmin.collection(collectionNames.tickets).doc(String(attachment.ticketId)).get();
    if (!ticket.exists || ticket.data()?.workspaceId !== principal.workspaceId || (principal.portalClientId && ticket.data()?.clientId !== principal.portalClientId)) return Response.json({ error: "Attachment not available.", code: "ATTACHMENT_NOT_FOUND" }, { status: 404 });
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? process.env.FIREBASE_STORAGE_BUCKET ?? adminApp.options.storageBucket;
    const buffer = bucketName && attachment.storageProvider === "firebase"
      ? (await getStorage(adminApp).bucket(bucketName).file(String(attachment.storagePath)).download())[0]
      : await readFile(join(process.cwd(), ".sourcehub-private-uploads", ...String(attachment.storagePath).split("/")));
    return new Response(buffer as BodyInit, { headers: { "Content-Type": String(attachment.mimeType ?? "application/octet-stream"), "Content-Disposition": `inline; filename="${String(attachment.originalName ?? "attachment").replace(/[^a-zA-Z0-9._-]/g, "-")}"` } });
  } catch (error) { return mobileJsonError(error); }
}
