import assert from "node:assert/strict";
import test from "node:test";

import { allowedMode, attendanceDayKey, elapsedMinutes, roundedMinutes } from "../lib/attendance";

test("attendance duration uses server-side timestamps and supports rounding", () => {
  const start = new Date("2026-07-21T08:00:00.000Z");
  const end = new Date("2026-07-21T16:07:00.000Z");
  assert.equal(elapsedMinutes(start, end), 487);
  assert.equal(roundedMinutes(487, 15), 480);
});

test("attendance date keys respect the configured timezone", () => {
  const instant = new Date("2026-07-21T22:30:00.000Z");
  assert.equal(attendanceDayKey(instant, "Africa/Johannesburg"), "2026-07-22");
  assert.equal(attendanceDayKey(instant, "UTC"), "2026-07-21");
});

test("attendance profiles restrict work modes", () => {
  assert.equal(allowedMode({ allowedWorkModes: ["OFFICE", "REMOTE"] }, "REMOTE"), true);
  assert.equal(allowedMode({ allowedWorkModes: ["OFFICE", "REMOTE"] }, "BUSINESS_TRAVEL"), false);
  assert.equal(allowedMode(null, "OTHER"), true);
});
