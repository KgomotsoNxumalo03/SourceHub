import { createHmac, timingSafeEqual } from "node:crypto";

export const commercialLifecycleStates = ["PROVISIONING", "TRIAL", "ACTIVE", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLATION_PENDING", "CANCELLED", "ARCHIVED"] as const;
export type CommercialLifecycleState = (typeof commercialLifecycleStates)[number];

const transitions: Record<CommercialLifecycleState, CommercialLifecycleState[]> = {
  PROVISIONING: ["TRIAL", "ACTIVE", "CANCELLED"],
  TRIAL: ["ACTIVE", "PAST_DUE", "CANCELLATION_PENDING", "CANCELLED"],
  ACTIVE: ["PAST_DUE", "CANCELLATION_PENDING", "SUSPENDED"],
  PAST_DUE: ["GRACE_PERIOD", "ACTIVE", "SUSPENDED", "CANCELLATION_PENDING"],
  GRACE_PERIOD: ["ACTIVE", "SUSPENDED", "CANCELLATION_PENDING"],
  SUSPENDED: ["ACTIVE", "GRACE_PERIOD", "CANCELLATION_PENDING", "CANCELLED"],
  CANCELLATION_PENDING: ["ACTIVE", "CANCELLED", "SUSPENDED"],
  CANCELLED: ["ARCHIVED", "ACTIVE"],
  ARCHIVED: [],
};

export function canTransitionLifecycle(from: CommercialLifecycleState, to: CommercialLifecycleState) { return from === to || transitions[from].includes(to); }
export function assertLifecycleTransition(from: CommercialLifecycleState, to: CommercialLifecycleState) { if (!canTransitionLifecycle(from, to)) throw new Error(`Illegal commercial lifecycle transition: ${from} -> ${to}.`); }

export type EntitlementDefinition = { enabled: boolean; limit?: number | null; unit?: string; source: "PLAN" | "OVERRIDE" | "FEATURE_FLAG" | "INTERNAL" };
export function resolveEffectiveEntitlement(plan: EntitlementDefinition | undefined, override: Partial<EntitlementDefinition> | undefined, featureFlag?: boolean): EntitlementDefinition {
  if (override) return { enabled: override.enabled ?? plan?.enabled ?? false, limit: override.limit ?? plan?.limit ?? null, unit: override.unit ?? plan?.unit, source: "OVERRIDE" };
  if (featureFlag !== undefined) return { enabled: featureFlag, limit: plan?.limit ?? null, unit: plan?.unit, source: "FEATURE_FLAG" };
  return { enabled: plan?.enabled ?? false, limit: plan?.limit ?? null, unit: plan?.unit, source: plan?.source ?? "PLAN" };
}

export function assertEntitlement(entitlement: EntitlementDefinition | undefined, feature: string) { if (!entitlement?.enabled) throw new Error(`The ${feature} feature is not enabled for this tenant.`); }
export function assertWithinQuota(entitlement: EntitlementDefinition | undefined, current: number, requested = 1) { if (entitlement?.limit != null && current + requested > entitlement.limit) throw new Error("This tenant has reached the configured usage limit. Existing data remains available during the review period."); }

export function signCommercialBillingPayload(secret: string, timestamp: string, payload: string) { return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`; }
export function safeCompare(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }

export function isValidHexColor(value: string) { return /^#[0-9a-f]{6}$/i.test(value); }
export function isInvitationUsable(status: string, expiresAt: Date, now = new Date()) { return status === "PENDING" && expiresAt.getTime() > now.getTime(); }
