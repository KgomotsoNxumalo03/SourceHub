import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { csvEscape, freshnessState, percentage, percentageChange, resolveReportDateRange, safeCsvCell } from "@/lib/reporting-utils";

describe("reporting calculations", () => {
  it("resolves equivalent comparison periods", () => {
    const range = resolveReportDateRange("this-month", undefined, undefined, new Date("2026-07-15T12:00:00Z"));
    assert.equal(range.start.getDate(), 1);
    assert.equal(range.comparisonStart.getMonth(), 4);
    assert.equal(range.comparisonStart.getDate(), 31);
    assert.equal(range.comparisonEnd.getMonth(), 6);
    assert.equal(range.comparisonEnd.getDate(), 1);
  });

  it("handles empty and negative comparison periods", () => {
    assert.equal(percentage(0, 0), null);
    assert.equal(percentage(5, 10), 50);
    assert.equal(percentageChange(10, 5), 100);
    assert.equal(percentageChange(0, 0), 0);
    assert.equal(percentageChange(5, 0), null);
  });

  it("prevents spreadsheet formula injection", () => {
    assert.equal(safeCsvCell("=HYPERLINK(\"https://bad\")"), "'=HYPERLINK(\"https://bad\")");
    assert.equal(safeCsvCell("normal"), "normal");
    assert.equal(csvEscape("+unsafe"), '"\'+unsafe"');
  });

  it("reports current and stale aggregate states", () => {
    assert.equal(freshnessState(new Date("2026-07-15T12:00:00Z"), 60, new Date("2026-07-15T12:30:00Z")), "CURRENT");
    assert.equal(freshnessState(new Date("2026-07-15T10:00:00Z"), 60, new Date("2026-07-15T12:30:00Z")), "STALE");
    assert.equal(freshnessState(null, 60), "STALE");
  });
});
