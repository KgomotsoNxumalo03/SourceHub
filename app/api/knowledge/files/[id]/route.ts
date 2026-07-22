import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getStorage } from "firebase-admin/storage";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma, adminApp } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await currentUser(); if (!actor || (!actor.permissions.includes("knowledge.internal.view") && !actor.permissions.includes("knowledge.files.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: actor ? 403 : 401 });
  const { id } = await params; const attachment: any = await prisma.knowledgeAttachment.findUnique({ where: { id } }); if (!attachment || attachment.workspaceId !== env.DEFAULT_WORKSPACE_ID) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? process.env.FIREBASE_STORAGE_BUCKET ?? "";
    const buffer = bucketName && !process.env.FIREBASE_STORAGE_EMULATOR_HOST ? (await getStorage(adminApp).bucket(bucketName).file(attachment.storagePath).download())[0] : await readPrivateUpload(attachment.storagePath);
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": attachment.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${String(attachment.fileName).replaceAll('"', "")}"` } });
  } catch { return NextResponse.json({ error: "File unavailable" }, { status: 404 }); }
}

async function readPrivateUpload(storagePath: string) {
  const root = resolve(process.cwd(), ".sourcehub-private-uploads"); const path = resolve(root, ...storagePath.split("/")); if (!path.startsWith(root + "\\")) throw new Error("Invalid path"); return readFile(path);
}
