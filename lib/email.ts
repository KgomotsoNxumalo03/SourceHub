import { sanitizeFilename } from "@/lib/storage";

export function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeEmailSubject(subject: string) {
  return subject.replace(/^\s*(re|fw|fwd):\s*/gi, "").trim();
}

export function extractTicketReference(text: string) {
  const match = text.match(/\bSH-(?:TKT|CLI)-\d{6,8}\b/i);
  return match?.[0].toUpperCase() ?? null;
}

export function buildDuplicateDetectionKey({
  messageId,
  sender,
  subject,
}: {
  messageId: string | null;
  sender: string;
  subject: string;
}) {
  return [messageId?.trim().toLowerCase() ?? "", normalizeEmailAddress(sender), normalizeEmailSubject(subject).toLowerCase()]
    .filter(Boolean)
    .join("|");
}

export function buildThreadKey({
  messageId,
  inReplyTo,
  references,
  subject,
}: {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[] | string | null;
  subject: string;
}) {
  const reference = Array.isArray(references) ? references[0] ?? null : references;
  return [
    messageId?.trim().toLowerCase() ?? "",
    inReplyTo?.trim().toLowerCase() ?? "",
    reference?.trim().toLowerCase() ?? "",
    normalizeEmailSubject(subject).toLowerCase(),
  ]
    .filter(Boolean)
    .join("|");
}

export function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .trim();
}

export function isAutomaticReply(headers: Record<string, string | undefined>) {
  const values = Object.entries(headers).map(([, value]) => (value ?? "").toLowerCase());
  return values.some((value) => /auto-replied|auto-generated|automatic reply|out of office|vacation/i.test(value));
}

export function validateEmailAttachment({
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
  if (!fileName.trim()) return "Attachment is missing a file name.";
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const blocked = new Set([".exe", ".bat", ".cmd", ".com", ".js", ".msi", ".ps1", ".scr", ".vbs", ".lnk", ".jar"]);
  if (blocked.has(extension)) return "This attachment type is not allowed.";
  if (sizeBytes > maxBytes) return `The attachment is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`;
  if (!mimeType) return "Attachment MIME type is required.";
  return null;
}

export function sanitizeEmailFilename(fileName: string) {
  return sanitizeFilename(fileName);
}

