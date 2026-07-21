import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";

import { currentUser } from "@/lib/auth";
import { prisma, adminApp } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await currentUser();
  if (!actor)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (
    !actor.permissions.includes("projects.view") &&
    !actor.permissions.includes("project_files.manage")
  )
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  const { id } = await params;
  const file = await prisma.projectFile.findUnique({ where: { id } });
  if (!file || file.workspaceId !== env.DEFAULT_WORKSPACE_ID || file.archivedAt)
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  if (file.storageProvider === "firebase") {
    const bucketName =
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
      process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName)
      return NextResponse.json(
        { error: "Storage is not configured." },
        { status: 503 },
      );
    const [url] = await getStorage(adminApp)
      .bucket(bucketName)
      .file(file.storagePath)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 10 * 60 * 1000,
      });
    return NextResponse.redirect(url);
  }
  const root = resolve(process.cwd(), ".sourcehub-private-uploads");
  const target = resolve(join(root, ...String(file.storagePath).split("/")));
  if (!target.startsWith(root + "\\") && !target.startsWith(root + "/"))
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  const buffer = await readFile(target).catch(() => null);
  if (!buffer)
    return NextResponse.json(
      { error: "File content is unavailable." },
      { status: 404 },
    );
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${String(file.originalName).replaceAll('"', "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
