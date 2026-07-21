export type Money = { minorUnits: number; currency: string };

function decimalParts(value: string | number) {
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new Error("Enter a valid decimal amount.");
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  return { negative, whole, fraction };
}

export function parseDecimalToMinorUnits(value: string | number, currency = "ZAR") {
  const { negative, whole, fraction } = decimalParts(value);
  if (negative) throw new Error("Money values cannot be negative.");
  const cents = fraction.padEnd(2, "0").slice(0, 2);
  const third = Number(fraction[2] ?? "0");
  const minor = Number(whole) * 100 + Number(cents) + (third >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(minor)) throw new Error("Amount is too large.");
  return minor;
}

export function parseQuantityToThousandths(value: string | number) {
  const { negative, whole, fraction } = decimalParts(value);
  if (negative) throw new Error("Quantities cannot be negative.");
  const scaled = Number(whole) * 1000 + Number(fraction.padEnd(3, "0").slice(0, 3));
  const rounded = Number(fraction[3] ?? "0") >= 5 ? scaled + 1 : scaled;
  if (!Number.isSafeInteger(rounded) || rounded <= 0) throw new Error("Quantity must be greater than zero.");
  return rounded;
}

export function roundHalfUp(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("Invalid money calculation.");
  }
  return Math.floor((numerator + denominator / 2) / denominator);
}

export function calculateLine({
  quantity,
  unitPriceMinorUnits,
  discountBps = 0,
  vatRateBps = 0,
}: {
  quantity: string | number;
  unitPriceMinorUnits: number;
  discountBps?: number;
  vatRateBps?: number;
}) {
  if (!Number.isSafeInteger(unitPriceMinorUnits) || unitPriceMinorUnits < 0) throw new Error("Invalid unit price.");
  if (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10000) throw new Error("Invalid discount.");
  if (!Number.isInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10000) throw new Error("Invalid VAT rate.");
  const quantityThousandths = parseQuantityToThousandths(quantity);
  const lineSubtotalMinorUnits = roundHalfUp(quantityThousandths * unitPriceMinorUnits, 1000);
  const discountMinorUnits = roundHalfUp(lineSubtotalMinorUnits * discountBps, 10000);
  const taxableMinorUnits = lineSubtotalMinorUnits - discountMinorUnits;
  const vatMinorUnits = roundHalfUp(taxableMinorUnits * vatRateBps, 10000);
  return {
    quantity: String(quantity),
    quantityThousandths,
    unitPriceMinorUnits,
    discountBps,
    vatRateBps,
    lineSubtotalMinorUnits,
    discountMinorUnits,
    vatMinorUnits,
    lineTotalMinorUnits: taxableMinorUnits + vatMinorUnits,
  };
}

export function calculateDocumentTotals(lines: Array<ReturnType<typeof calculateLine>>, currency = "ZAR") {
  return lines.reduce(
    (totals, line) => ({
      currency,
      subtotalMinorUnits: totals.subtotalMinorUnits + line.lineSubtotalMinorUnits,
      discountMinorUnits: totals.discountMinorUnits + line.discountMinorUnits,
      vatMinorUnits: totals.vatMinorUnits + line.vatMinorUnits,
      totalMinorUnits: totals.totalMinorUnits + line.lineTotalMinorUnits,
    }),
    { currency, subtotalMinorUnits: 0, discountMinorUnits: 0, vatMinorUnits: 0, totalMinorUnits: 0 },
  );
}

export function formatMinorUnits(minorUnits: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(minorUnits / 100);
}

export function dateForPaymentTerms(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
