import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateProjectHealth,
  canTransitionProjectStatus,
  canTransitionTaskStatus,
  dependencyWouldCycle,
  progressFromTasks,
  riskSeverity,
} from "@/lib/project-utils";

test("project status transitions require the approved workflow", () => {
  assert.equal(canTransitionProjectStatus("DRAFT", "PLANNING"), true);
  assert.equal(canTransitionProjectStatus("DRAFT", "ACTIVE"), false);
  assert.equal(canTransitionProjectStatus("COMPLETED", "ACTIVE"), false);
});

test("task status transitions preserve completed history", () => {
  assert.equal(canTransitionTaskStatus("TODO", "IN_PROGRESS"), true);
  assert.equal(canTransitionTaskStatus("COMPLETED", "IN_PROGRESS"), false);
  assert.equal(canTransitionTaskStatus("BLOCKED", "IN_PROGRESS"), true);
});

test("dependency validation rejects self and circular edges", () => {
  assert.equal(dependencyWouldCycle([], "a", "a"), true);
  assert.equal(
    dependencyWouldCycle(
      [{ predecessorTaskId: "a", successorTaskId: "b" }],
      "b",
      "a",
    ),
    true,
  );
  assert.equal(
    dependencyWouldCycle(
      [{ predecessorTaskId: "a", successorTaskId: "b" }],
      "b",
      "c",
    ),
    false,
  );
});

test("project progress and health are explainable", () => {
  assert.equal(
    progressFromTasks([
      { status: "COMPLETED" },
      { status: "IN_PROGRESS" },
      { status: "CANCELLED" },
    ]),
    33,
  );
  assert.equal(riskSeverity("HIGH", "HIGH"), "CRITICAL");
  const health = calculateProjectHealth({
    project: { status: "ACTIVE" },
    tasks: [{ status: "BLOCKED" }],
    milestones: [],
    risks: [],
  });
  assert.equal(health.health, "AT_RISK");
  assert.deepEqual(health.factors, ["1 blocked task"]);
});
