import { mobileConfig } from "@mobile/core/config";
import { readToken } from "@mobile/core/storage";

export class MobileApiError extends Error { status: number; code?: string; constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; } }

async function request<T>(path: string, init: RequestInit = {}) {
  const token = await readToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set("X-SourceHub-App-Version", mobileConfig.appVersion);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${mobileConfig.apiUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new MobileApiError(body.error ?? "The mobile request failed.", response.status, body.code);
  return body as T;
}

export const mobileApi = {
  login: (input: { email: string; password: string; deviceId: string; platform: "android" | "ios" | "web" | "unknown"; appVersion: string }) => request<any>("/api/mobile/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => request<{ ok: true }>("/api/mobile/auth/logout", { method: "POST" }),
  me: () => request<any>("/api/mobile/me"),
  bootstrap: () => request<any>("/api/mobile/bootstrap"),
  sync: (operations: unknown[]) => request<any>("/api/mobile/sync", { method: "POST", body: JSON.stringify({ operations }) }),
  registerPushToken: (input: unknown) => request<any>("/api/mobile/push-token", { method: "POST", body: JSON.stringify(input) }),
  recordLocation: (input: unknown) => request<any>("/api/mobile/location", { method: "POST", body: JSON.stringify(input) }),
  uploadTicketFile: async (ticketId: string, uri: string, name: string, mimeType: string) => {
    const form = new FormData();
    form.append("ticketId", ticketId);
    form.append("file", { uri, name, type: mimeType } as any);
    return request<any>("/api/mobile/tickets/upload", { method: "POST", body: form });
  },
  askAi: (input: unknown) => request<any>("/api/mobile/ai", { method: "POST", body: JSON.stringify(input) }),
};
