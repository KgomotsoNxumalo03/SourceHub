import type { MobilePrincipal, SyncOperation } from "./types";

export function hasMobilePermission(user: MobilePrincipal | null, permission: string) { return Boolean(user?.mobilePermissions.includes(permission) || user?.permissions.includes(permission)); }

export function roleMode(user: MobilePrincipal | null) {
  if (!user) return "guest" as const;
  if (hasMobilePermission(user, "mobile.client.access") || user.portalClientId) return "client" as const;
  if (hasMobilePermission(user, "mobile.technician.access")) return "technician" as const;
  return "employee" as const;
}

export function safeQrValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500 || /[\u0000-\u001f]/.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try { const url = new URL(trimmed); if (url.protocol !== "https:" || !url.hostname.endsWith("sourceitservices.co.za")) return null; return url.pathname + url.search; } catch { return null; }
  }
  if (/^(SH-[A-Z0-9-]+|asset[:/][A-Z0-9_-]+)$/i.test(trimmed)) return trimmed;
  return null;
}

export function safeDeepLink(value: string) {
  if (/(^|\/)\.\.(\/|$)/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "sourcehub:" || !["ticket", "asset", "endpoint", "project", "task", "knowledge", "notification", "approval"].includes(url.hostname)) return null;
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(id)) return null;
    return { resource: url.hostname, id } as const;
  } catch { return null; }
}

export function operationKey(type: string, recordId: string) { return `${type}:${recordId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`; }

export function redactNotificationPreview(value: string) { return value.replace(/(password|token|secret|api.?key|bank|identity)\s*[:=]\s*[^\s,]+/gi, "$1: [redacted]").slice(0, 160); }

export function resolveSyncConflict(operation: SyncOperation, serverUpdatedAt: string | undefined) {
  if (!operation.baseUpdatedAt || !serverUpdatedAt) return { outcome: "apply" as const };
  if (new Date(serverUpdatedAt).getTime() > new Date(operation.baseUpdatedAt).getTime()) return { outcome: "review" as const, reason: "The server record changed while this action was offline." };
  return { outcome: "apply" as const };
}
