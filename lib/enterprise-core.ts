import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const enterpriseScopes = [
  "tickets.read", "tickets.write", "clients.read", "assets.read", "assets.write", "endpoints.read",
  "projects.read", "projects.write", "knowledge.read", "reports.read", "automations.trigger", "notifications.write",
] as const;

const safeDefaultRoles = new Set(["Employee", "Technician"]);
const privilegedRoles = new Set(["Super Administrator", "Platform Administrator"]);

export const identityProviderSchema = z.object({
  name: z.string().trim().min(2).max(120),
  providerType: z.enum(["GOOGLE", "MICROSOFT_ENTRA", "SAML", "OIDC"]),
  enabled: z.boolean().default(false),
  workspaceId: z.string().trim().min(1),
  allowedEmailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(20).default([]),
  tenantId: z.string().trim().max(160).optional().or(z.literal("")),
  authority: z.string().trim().url().optional().or(z.literal("")),
  issuer: z.string().trim().url().optional().or(z.literal("")),
  clientId: z.string().trim().max(240).optional().or(z.literal("")),
  redirectUri: z.string().trim().url().optional().or(z.literal("")),
  claimMappings: z.record(z.string(), z.string().trim().max(160)).default({}),
  defaultRole: z.string().trim().min(1).max(80).default("Employee"),
  defaultPermissionProfile: z.string().trim().max(120).optional().or(z.literal("")),
  autoCreateUsers: z.boolean().default(false),
  allowExistingEmailLinking: z.boolean().default(false),
  groupMappings: z.record(z.string(), z.string().trim().max(80)).default({}),
  loginEnforcement: z.enum(["OPTIONAL", "REQUIRED", "DISABLED"]).default("OPTIONAL"),
  secretRef: z.string().trim().max(240).optional().or(z.literal("")),
});

export function validateIdentityProvider(input: unknown) {
  const value = identityProviderSchema.parse(input);
  if (privilegedRoles.has(value.defaultRole) || !safeDefaultRoles.has(value.defaultRole)) throw new Error("Enterprise identity providers may only assign a safe non-privileged default role.");
  if (value.providerType === "MICROSOFT_ENTRA" && !value.tenantId) throw new Error("Microsoft Entra providers require an approved tenant ID.");
  if (value.providerType === "GOOGLE" && value.allowedEmailDomains.length === 0) throw new Error("Google sign-in requires at least one approved Workspace domain.");
  if ((value.providerType === "SAML" || value.providerType === "OIDC") && !value.issuer) throw new Error("SAML/OIDC readiness requires an issuer URL.");
  return value;
}

export function isPrivateAddress(address: string) {
  const value = address.toLowerCase().replace(/\.$/, "");
  return value === "localhost" || value === "::1" || value === "0.0.0.0" || value.startsWith("127.") || value.startsWith("10.") || value.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value) || value.startsWith("169.254.") || value.startsWith("fc") || value.startsWith("fd");
}

export function signWebhookPayload(secret: string, timestamp: string, eventId: string, payload: string) { return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${eventId}.${payload}`).digest("hex")}`; }
export function safeCompare(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }

export type EnterpriseScope = (typeof enterpriseScopes)[number];
