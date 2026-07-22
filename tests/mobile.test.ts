import assert from "node:assert/strict";
import test from "node:test";

import { redactNotificationPreview, resolveSyncConflict, roleMode, safeDeepLink, safeQrValue } from "../apps/mobile/src/core/mobile-core.ts";

const user = (permissions: string[], portalClientId: string | null = null) => ({ id: "u1", workspaceId: "w1", email: "user@example.com", employeeNumber: "SH-1", firstName: "Test", lastName: "User", jobTitle: null, status: "ACTIVE", permissions, roles: [], portalClientId, mobilePermissions: permissions, sessionId: "s1" });

test("mobile QR and deep links accept only bounded SourceHub identifiers", () => {
  assert.equal(safeQrValue("https://sourceitservices.co.za/tickets/SH-100"), "/tickets/SH-100");
  assert.equal(safeQrValue("https://evil.example/tickets/SH-100"), null);
  assert.deepEqual(safeDeepLink("sourcehub://ticket/SH-100"), { resource: "ticket", id: "SH-100" });
  assert.equal(safeDeepLink("sourcehub://ticket/../../secret"), null);
});

test("mobile role modes and previews remain permission aware", () => {
  assert.equal(roleMode(user(["mobile.access", "mobile.technician.access"])), "technician");
  assert.equal(roleMode(user(["mobile.access", "mobile.client.access"], "client-1")), "client");
  assert.equal(redactNotificationPreview("token=abc password=hunter2"), "token: [redacted] password: [redacted]");
});

test("offline conflicts prefer server review when the record changed", () => {
  const operation: any = { type: "ticket.update", idempotencyKey: "x", payload: {}, baseUpdatedAt: "2026-07-22T10:00:00.000Z" };
  assert.deepEqual(resolveSyncConflict(operation, "2026-07-22T10:01:00.000Z"), { outcome: "review", reason: "The server record changed while this action was offline." });
  assert.deepEqual(resolveSyncConflict(operation, "2026-07-22T09:59:00.000Z"), { outcome: "apply" });
});
