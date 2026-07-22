import assert from "node:assert/strict";
import test from "node:test";

import { actionRegistry, dryRunWorkflow, evaluateConditionTree, renderAutomationTemplate, validateConditionTree, validateWorkflowDefinition } from "../lib/automation-core.ts";

test("automation conditions support nested AND and OR groups", () => {
  const condition = { logic: "AND" as const, conditions: [{ field: "trigger.priority", operator: "equals" as const, value: "CRITICAL" }, { logic: "OR" as const, conditions: [{ field: "new.status", operator: "equals" as const, value: "OPEN" }, { field: "new.status", operator: "equals" as const, value: "IN_PROGRESS" }] }] };
  assert.equal(evaluateConditionTree(condition, { trigger: { priority: "CRITICAL" }, new: { status: "IN_PROGRESS" } }), true);
  assert.equal(evaluateConditionTree(condition, { trigger: { priority: "LOW" }, new: { status: "IN_PROGRESS" } }), false);
});

test("automation conditions reject unsafe and unknown properties", () => {
  const errors = validateConditionTree({ field: "trigger.__proto__.polluted", operator: "equals", value: "x" });
  assert.ok(errors.some((error) => error.includes("not approved")));
  assert.ok(errors.some((error) => error.includes("Unsafe")));
});

test("workflow validation rejects arbitrary actions and excessive depth", () => {
  const definition = { trigger: { key: "ticket.created" }, steps: [{ id: "step_1", type: "action", name: "Unsafe", action: "run_shell", enabled: true, config: {} }] };
  assert.ok(validateWorkflowDefinition(definition).some((error) => error.includes("not approved")));
  const deep = { logic: "AND", conditions: [{ logic: "AND", conditions: [{ logic: "AND", conditions: [{ logic: "AND", conditions: [{ logic: "AND", conditions: [{ field: "trigger.status", operator: "equals", value: "OPEN" }] }] }] }] }] };
  assert.ok(validateConditionTree(deep).some((error) => error.includes("deeper")));
});

test("templates escape content and replace missing values safely", () => {
  assert.equal(renderAutomationTemplate("Ticket {{trigger.reference}}: {{trigger.message}}", { trigger: { reference: "SH-1", message: "<script>" } }), "Ticket SH-1: &lt;script&gt;");
  assert.equal(renderAutomationTemplate("{{trigger.missing}}", { trigger: {} }), "[missing value]");
});

test("dry runs expose proposed actions without claiming delivery", () => {
  const definition: any = { trigger: { key: "ticket.created" }, steps: [{ id: "step_1", type: "action", action: "send_approved_email", name: "Email", enabled: true, config: {} }] };
  const result = dryRunWorkflow(definition, { trigger: { eventType: "ticket.created" } });
  assert.equal(result.triggerMatched, true);
  assert.equal(result.steps[0].proposed, true);
  assert.equal(result.steps[0].requiresApproval, true);
  assert.equal(actionRegistry.some((entry) => entry.key === "send_webhook" && entry.highRisk), true);
});
