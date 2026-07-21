import test from "node:test";
import assert from "node:assert/strict";

import { calculateDocumentTotals, calculateLine, formatMinorUnits, parseDecimalToMinorUnits } from "@/lib/money";
import { invoiceBalance, sumAllocatedPayments } from "@/lib/finance-utils";

test("finance money parsing uses integer minor units", () => {
  assert.equal(parseDecimalToMinorUnits("1000.00"), 100000);
});

test("finance money parsing rejects malformed input and rounds safely", () => {
  assert.equal(parseDecimalToMinorUnits("1000.005"), 100001);
  assert.equal(parseDecimalToMinorUnits("12.49"), 1249);
  assert.throws(() => parseDecimalToMinorUnits("1,000.00"));
  assert.throws(() => parseDecimalToMinorUnits("-1.00"));
});

test("line totals calculate discount and VAT without floating point authority", () => {
  const line = calculateLine({ quantity: "2", unitPriceMinorUnits: 10000, discountBps: 1000, vatRateBps: 1500 });
  assert.equal(line.lineSubtotalMinorUnits, 20000);
  assert.equal(line.discountMinorUnits, 2000);
  assert.equal(line.vatMinorUnits, 2700);
  assert.equal(line.lineTotalMinorUnits, 20700);
  assert.deepEqual(calculateDocumentTotals([line], "ZAR"), { currency: "ZAR", subtotalMinorUnits: 20000, discountMinorUnits: 2000, vatMinorUnits: 2700, totalMinorUnits: 20700 });
  assert.equal(formatMinorUnits(20700).replace(/\u00a0/g, " "), "R 207,00");
});

test("payment allocation cannot create a negative invoice balance", () => {
  assert.equal(invoiceBalance(10000, 2500), 7500);
  assert.equal(invoiceBalance(10000, 12000), 0);
  assert.equal(sumAllocatedPayments([{ amountMinorUnits: 2500 }, { amountMinorUnits: 7500 }]), 10000);
});
