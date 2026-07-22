import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { articleSearchTokens, canAccessKnowledgeArticle, containsPotentialSecret, knowledgePlainTextFromHtml, prerequisiteWouldCycle, safeKnowledgeExternalUrl, sanitizeKnowledgeHtml, slugifyKnowledge } from "@/lib/knowledge-utils";

describe("knowledge security utilities", () => {
  it("removes executable markup and unsafe URLs", () => {
    const html = sanitizeKnowledgeHtml('<script>alert(1)</script><p onclick="alert(2)">Safe <a href="javascript:alert(3)">link</a></p><iframe src="https://bad.example"></iframe>');
    assert.equal(html.includes("script"), false);
    assert.equal(html.includes("onclick"), false);
    assert.equal(html.includes("javascript"), false);
    assert.equal(html.includes("Safe"), true);
  });

  it("derives readable text and search tokens", () => {
    assert.equal(knowledgePlainTextFromHtml("<h1>Hello</h1><p>World</p>"), "Hello World");
    assert.deepEqual(articleSearchTokens("M365 Joiner", "Onboarding", "Assign a licence", ["security"]).includes("onboarding"), true);
    assert.equal(slugifyKnowledge("  MFA & Account Setup! "), "mfa-account-setup");
  });

  it("detects secrets and blocks private link targets", () => {
    assert.ok(containsPotentialSecret("password=do-not-store").length);
    assert.equal(safeKnowledgeExternalUrl("http://localhost:3000/admin"), false);
    assert.equal(safeKnowledgeExternalUrl("https://docs.example.com/help"), true);
  });

  it("detects prerequisite cycles", () => {
    assert.equal(prerequisiteWouldCycle([{ from: "a", to: "b" }, { from: "b", to: "c" }], "c", "a"), true);
    assert.equal(prerequisiteWouldCycle([{ from: "a", to: "b" }], "a", "c"), false);
  });

  it("keeps public and client visibility bounded", () => {
    assert.equal(canAccessKnowledgeArticle({ status: "DRAFT", visibility: "PUBLIC" }), false);
    assert.equal(canAccessKnowledgeArticle({ status: "PUBLISHED", visibility: "PUBLIC" }), true);
    assert.equal(canAccessKnowledgeArticle({ status: "PUBLISHED", visibility: "CLIENT", clientId: "acme" }, { portal: true }, "blue-river"), false);
    assert.equal(canAccessKnowledgeArticle({ status: "PUBLISHED", visibility: "CLIENT", clientId: "acme" }, { portal: true }, "acme"), true);
  });
});
