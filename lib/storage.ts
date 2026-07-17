import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { getStorage } from "firebase-admin/storage";

import { adminApp } from "@/lib/db";

export const dangerousFileExtensions = new Set([
  ".ade",
  ".adp",
  ".bat",
  ".chm",
  ".cmd",
  ".com",
  ".cpl",
  ".dll",
  ".exe",
  ".hta",
  ".jar",
  ".js",
  ".jse",
  ".lnk",
  ".msi",
  ".msp",
  ".mst",
  ".pif",
  ".ps1",
  ".scr",
  ".sct",
  ".sh",
  ".url",
  ".vb",
  ".vbe",
  ".vbs",
  ".wsf",
  ".wsh",
]);

export function sanitizeFilename(input: string) {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^-+|-+$/g, "");

  return cleaned || "file";
}

export function dangerousExtension(fileName: string) {
  return dangerousFileExtensions.has(fileName.slice(fileName.lastIndexOf(".")).toLowerCase());
}

export function buildStoragePath(...segments: string[]) {
  return segments
    .flatMap((segment) => segment.split("/"))
    .map(sanitizeFilename)
    .filter(Boolean)
    .join("/");
}

export function buildWorkspaceStoragePath(workspaceId: string, ...segments: string[]) {
  return buildStoragePath("workspaces", workspaceId, ...segments);
}

export function buildTicketStoragePath(workspaceId: string, ticketReference: string, fileName: string) {
  return buildWorkspaceStoragePath(workspaceId, "tickets", ticketReference, "files", fileName);
}

export function buildClientStoragePath(workspaceId: string, clientId: string, fileName: string) {
  return buildWorkspaceStoragePath(workspaceId, "clients", clientId, "files", fileName);
}

export function validateUpload({
  fileName,
  mimeType,
  sizeBytes,
  maxBytes,
}: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  maxBytes: number;
}) {
  if (!fileName.trim()) return "File name is required.";
  if (dangerousExtension(fileName)) return "This file type is not allowed.";
  if (sizeBytes <= 0) return "The file is empty.";
  if (sizeBytes > maxBytes) return `The file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;

  const safeMimeTypes = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  if (mimeType && !safeMimeTypes.some((entry) => mimeType === entry || mimeType.startsWith("image/"))) {
    return "This file type is not allowed.";
  }

  return null;
}

async function saveLocally(storagePath: string, buffer: Buffer) {
  const fullPath = join(process.cwd(), "public", "uploads", ...storagePath.split("/"));
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return `/uploads/${storagePath.replace(/\\/g, "/")}`;
}

export async function saveBinaryToStorage({
  storagePath,
  buffer,
  contentType,
}: {
  storagePath: string;
  buffer: Buffer;
  contentType: string;
}) {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? process.env.FIREBASE_STORAGE_BUCKET ?? "";
  const shouldUseBucket = Boolean(bucketName) && !process.env.FIREBASE_STORAGE_EMULATOR_HOST;

  if (!shouldUseBucket) {
    const publicUrl = await saveLocally(storagePath, buffer);
    return {
      storagePath,
      publicUrl,
      provider: "filesystem" as const,
    };
  }

  const bucket = getStorage(adminApp).bucket(bucketName);
  await bucket.file(storagePath).save(buffer, {
    metadata: {
      contentType,
    },
    resumable: false,
  });

  return {
    storagePath,
    publicUrl: `gs://${bucketName}/${storagePath}`,
    provider: "firebase" as const,
  };
}

export function publicUploadUrl(storagePath: string) {
  return `/uploads/${storagePath.replace(/\\/g, "/")}`;
}

export function storagePathJoin(...segments: string[]) {
  return posix.join(...segments.map(sanitizeFilename));
}
