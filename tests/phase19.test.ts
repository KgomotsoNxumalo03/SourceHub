import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateHealthStatus, feedbackSchema, operationalEventNames, operationalSliTargets, safeAnalyticsMetadata, sanitizeOperationalText } from "../lib/operations-core.ts";

test("operational text removes markup and secret-shaped values", () => {
  const value = sanitizeOperationalText("<script>alert(1)</script> password=top-secret Bearer abc123");
  assert.equal(value.includes("<script>"), false);
  assert.equal(value.includes("top-secret"), false);
  assert.match(value, /\[REDACTED\]/);
});

test("feedback schema is bounded and privacy defaults to private", () => {
  const value = feedbackSchema.parse({ category: "BUG", module: "Tickets", description: "The ticket list takes too long to load for a technician.", impact: "HIGH", frequency: "FREQUENT" });
  assert.equal(value.visibility, "PRIVATE");
  assert.throws(() => feedbackSchema.parse({ ...value, description: "too short" }));
});

test("analytics uses an explicit event and metadata allowlist", () => {
  assert.ok(operationalEventNames.includes("module.opened"));
  const metadata = safeAnalyticsMetadata({ module: "Tickets", durationMs: 120, email: "person@example.com", description: "private content" });
  assert.deepEqual(metadata, { module: "Tickets", durationMs: 120 });
});

test("health status distinguishes stale, failed, and current checks", () => {
  const now = new Date("2026-07-23T10:00:00Z");
  assert.equal(calculateHealthStatus({ lastSuccessAt: new Date("2026-07-23T09:59:00Z"), now }), "HEALTHY");
  assert.equal(calculateHealthStatus({ lastSuccessAt: new Date("2026-07-23T09:30:00Z"), now }), "DEGRADED");
  assert.equal(calculateHealthStatus({ lastSuccessAt: new Date("2026-07-23T09:59:00Z"), failureCount: 3, now }), "DOWN");
  assert.equal(calculateHealthStatus({ now }), "UNKNOWN");
});

test("SLI values are labelled internal targets rather than customer promises", () => {
  assert.equal(operationalSliTargets.availabilityPercent, 99.5);
  assert.ok(operationalSliTargets.p95LatencyMs > 0);
});

test("operational Firestore records are server-write-only", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/operationalAnalyticsEvents\/\{id\}/);
  assert.match(rules, /match \/operationalIncidents\/\{id\}[\s\S]*?allow write: if false;/);
});
