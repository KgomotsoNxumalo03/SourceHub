import assert from "node:assert/strict";
import test from "node:test";

import { enterpriseScopes, isPrivateAddress, safeCompare, signWebhookPayload, validateIdentityProvider } from "../lib/enterprise-core.ts";

test("enterprise webhook signatures are deterministic and constant-time comparable", () => {
  const signature = signWebhookPayload("test-secret", "1721640000", "evt-1", '{"ok":true}');
  assert.equal(signature, "sha256=5e4ec2c868188074cc677418d0512ecc548cb20623bd094d3f98878a6bcfbf4a");
  assert.equal(safeCompare(signature, signature), true);
  assert.equal(safeCompare(signature, `${signature}x`), false);
});

test("enterprise destination validation blocks private and local addresses", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.0.0.8"), true);
  assert.equal(isPrivateAddress("localhost"), true);
  assert.equal(isPrivateAddress("203.0.113.10"), false);
});

test("identity providers cannot default-provision privileged roles", () => {
  assert.throws(() => validateIdentityProvider({ name: "Google", providerType: "GOOGLE", workspaceId: "w1", allowedEmailDomains: ["example.com"], defaultRole: "Super Administrator" }), /non-privileged/);
  assert.throws(() => validateIdentityProvider({ name: "Google", providerType: "GOOGLE", workspaceId: "w1", allowedEmailDomains: [] }), /approved Workspace domain/);
  assert.equal(validateIdentityProvider({ name: "Google", providerType: "GOOGLE", workspaceId: "w1", allowedEmailDomains: ["example.com"], defaultRole: "Employee" }).defaultRole, "Employee");
});

test("enterprise API scopes are explicit and bounded", () => {
  assert.ok(enterpriseScopes.includes("tickets.read"));
  assert.ok(enterpriseScopes.includes("reports.read"));
  assert.equal(new Set(enterpriseScopes).size, enterpriseScopes.length);
});
