import assert from "node:assert/strict";
import test from "node:test";

import { assertEntitlement, assertLifecycleTransition, assertWithinQuota, isInvitationUsable, isValidHexColor, resolveEffectiveEntitlement, safeCompare, signCommercialBillingPayload } from "../lib/commercial-core.ts";

test("commercial lifecycle rejects unsafe state transitions", () => {
  assertLifecycleTransition("TRIAL", "ACTIVE");
  assertLifecycleTransition("CANCELLED", "ARCHIVED");
  assert.throws(() => assertLifecycleTransition("ARCHIVED", "ACTIVE"), /Illegal commercial lifecycle/);
});

test("commercial entitlements apply overrides and preserve safe limits", () => {
  const plan = { enabled: true, limit: 10, unit: "members", source: "PLAN" as const };
  assert.deepEqual(resolveEffectiveEntitlement(plan, { limit: 8 }), { enabled: true, limit: 8, unit: "members", source: "OVERRIDE" });
  assert.doesNotThrow(() => assertWithinQuota(plan, 9, 1));
  assert.throws(() => assertWithinQuota(plan, 10, 1), /usage limit/);
  assert.doesNotThrow(() => assertEntitlement(plan, "members"));
});

test("commercial billing signatures are replay-safe inputs and constant-time comparable", () => {
  const signature = signCommercialBillingPayload("sandbox-secret", "1700000000", '{"id":"evt-1"}');
  assert.match(signature, /^sha256=[a-f0-9]{64}$/);
  assert.equal(safeCompare(signature, signature), true);
  assert.equal(safeCompare(signature, `${signature}x`), false);
});

test("branding and invitation validation remains bounded", () => {
  assert.equal(isValidHexColor("#092058"), true);
  assert.equal(isValidHexColor("red"), false);
  assert.equal(isInvitationUsable("PENDING", new Date(Date.now() + 60_000)), true);
  assert.equal(isInvitationUsable("USED", new Date(Date.now() + 60_000)), false);
});
