import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertDemoEnvironment, defaultPilotChecklist, escapeCsvCell, pilotDecisionOutcomes, pilotPersonas, syntheticSeedRecords } from "../lib/pilot-core.ts";

test("pilot readiness starts with all human checklist items pending", () => {
  assert.equal(defaultPilotChecklist.length, 24);
  assert.ok(defaultPilotChecklist.includes("Technical approval"));
  assert.ok(pilotDecisionOutcomes.includes("READY_FOR_CONTROLLED_INTERNAL_PILOT"));
});

test("synthetic records are deterministic and tenant scoped", () => {
  const first = syntheticSeedRecords("small");
  const second = syntheticSeedRecords("small");
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.ok(first.every((record) => record.synthetic && record.tenantId === record.workspaceId));
});

test("demo environment guard refuses production and unapproved targets", () => {
  assert.throws(() => assertDemoEnvironment({ nodeEnv: "production", projectId: "sourcehub-prod", appUrl: "https://sourcehub.example.com" }), /blocked in production/);
  assert.throws(() => assertDemoEnvironment({ nodeEnv: "development", projectId: "sourcehub-demo", appUrl: "http://localhost:3000" }), /requires the Firebase Emulator/);
  assert.equal(assertDemoEnvironment({ nodeEnv: "development", projectId: "sourcehub-demo", appUrl: "http://localhost:3000", firestoreEmulatorHost: "127.0.0.1:8080" }), true);
});

test("UAT CSV export prevents spreadsheet formula injection", () => {
  assert.match(escapeCsvCell("=HYPERLINK(\"https://example.com\")"), /^"'=HYPERLINK/);
  assert.equal(escapeCsvCell("a,b"), "\"a,b\"");
});

test("pilot personas remain documented and direct client writes are denied", () => {
  assert.equal(pilotPersonas.length, 10);
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/pilotPrograms\/\{id\}[\s\S]*?allow write: if false;/);
  assert.match(rules, /match \/pilotUatCases\/\{id\}/);
  const seed = readFileSync("scripts/seed-pilot-demo.mjs", "utf8");
  assert.match(seed, /--confirm-reset/);
  assert.match(seed, /production/);
});
