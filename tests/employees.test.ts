import assert from "node:assert/strict";
import test from "node:test";

import { canTransitionEmployeeStatus, contractStatus, employeeDisplayName, maskIdentityReference } from "../lib/employees";

test("employee lifecycle transitions protect terminal states", () => {
  assert.equal(canTransitionEmployeeStatus("PREBOARDING", "ACTIVE"), true);
  assert.equal(canTransitionEmployeeStatus("ACTIVE", "NOTICE_PERIOD"), true);
  assert.equal(canTransitionEmployeeStatus("ARCHIVED", "ACTIVE"), false);
  assert.equal(canTransitionEmployeeStatus("ACTIVE", "FORMER_EMPLOYEE"), false);
});

test("employee identity values are masked and names prefer the preferred name", () => {
  assert.equal(maskIdentityReference("9001015009087"), "•••••••••9087");
  assert.equal(maskIdentityReference("1234"), "••••");
  assert.equal(employeeDisplayName({ firstName: "Thembi", middleNames: "Noma", lastName: "Dlamini", preferredName: "Tee" }), "Tee Noma Dlamini");
});

test("contract status exposes expired and near-expiry records", () => {
  assert.equal(contractStatus({ status: "ACTIVE", endDate: new Date(Date.now() - 86400000) }), "EXPIRED");
  assert.equal(contractStatus({ status: "ACTIVE", endDate: new Date(Date.now() + 10 * 86400000) }), "EXPIRING_SOON");
  assert.equal(contractStatus({ status: "DRAFT", endDate: new Date(Date.now() - 86400000) }), "DRAFT");
});
