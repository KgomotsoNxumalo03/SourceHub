import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

test("Storage private reads require the caller workspace", () => {
  const rules = readFileSync(join(root, "storage.rules"), "utf8");
  const block = (name: string) => {
    const start = rules.indexOf(name);
    const end = rules.indexOf("    match ", start + name.length);
    return rules.slice(start, end === -1 ? rules.length : end);
  };

  for (const path of ["clients", "assets", "tickets"]) {
    assert.match(block(`    match /workspaces/{workspaceId}/${path}`), /allow read: if workspaceMatches\(workspaceId\)/);
  }
  for (const path of ["projects", "knowledge"]) {
    const pathBlock = block(`    match /workspaces/{workspaceId}/${path}`);
    assert.match(pathBlock, /workspaceMatches\(workspaceId\)/);
    assert.match(pathBlock, /portalMatches/);
  }
});

test("commercial mode remains disabled by default in the environment template", () => {
  const example = readFileSync(join(root, ".env.example"), "utf8");

  assert.match(example, /^COMMERCIAL_SAAS_ENABLED="false"$/m);
  assert.match(example, /^COMMERCIAL_BILLING_ENABLED="false"$/m);
  assert.match(example, /^COMMERCIAL_BILLING_PROVIDER="disabled"$/m);
});
