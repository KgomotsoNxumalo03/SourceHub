import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const storageRules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");

test("commercial Firestore rules require an explicit tenant claim", () => {
  assert.match(rules, /function tenantMatches\(tenantId\)/);
  assert.match(rules, /request\.auth\.token\.tenantId == tenantId/);
  assert.match(rules, /match \/tenantMemberships\/\{id\}/);
  assert.match(rules, /match \/commercialSubscriptions\/\{id\}/);
  assert.match(rules, /match \/commercialIntegrationSecrets\/\{id\} \{[\s\S]*allow read, write: if false;/);
});

test("commercial Storage paths are tenant scoped and client writes are denied", () => {
  assert.match(storageRules, /match \/workspaces\/\{tenantId\}\/commercial\/\{allPaths=\*\*\}/);
  assert.match(storageRules, /allow write: if false;/);
  assert.match(storageRules, /request\.auth\.token\.tenantId == tenantId/);
});
