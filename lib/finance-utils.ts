import { calculateDocumentTotals, calculateLine, parseDecimalToMinorUnits } from "@/lib/money";

export const quoteStatusLabels: Record<string, string> = {
  DRAFT: "Draft", PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", SENT: "Sent",
  VIEWED: "Viewed", ACCEPTED: "Accepted", DECLINED: "Declined", EXPIRED: "Expired",
  CONVERTED: "Converted", CANCELLED: "Cancelled",
};
export const invoiceStatusLabels: Record<string, string> = {
  DRAFT: "Draft", PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", SENT: "Sent",
  VIEWED: "Viewed", PARTIALLY_PAID: "Partially paid", PAID: "Paid", OVERDUE: "Overdue",
  DISPUTED: "Disputed", VOIDED: "Voided", WRITTEN_OFF: "Written off",
};

export function invoiceBalance(totalMinorUnits: number, allocatedMinorUnits: number) {
  return Math.max(0, totalMinorUnits - allocatedMinorUnits);
}

export function financeStatusTone(status: string): "success" | "warning" | "danger" | "outline" {
  if (["PAID", "APPROVED", "ACCEPTED", "RECEIVED", "REIMBURSED"].includes(status)) return "success";
  if (["PENDING_APPROVAL", "PARTIALLY_PAID", "OVERDUE", "SUBMITTED", "REQUESTED"].includes(status)) return "warning";
  if (["CANCELLED", "DECLINED", "REJECTED", "VOIDED"].includes(status)) return "danger";
  return "outline";
}

export function financeNumberPrefix(type: "quote" | "invoice" | "creditNote" | "purchaseOrder" | "payment") {
  return { quote: "Q", invoice: "INV", creditNote: "CN", purchaseOrder: "PO", payment: "PAY" }[type];
}

export function sumAllocatedPayments(allocations: Array<{ amountMinorUnits: number }>) {
  return allocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0);
}

export type FinanceLineInput = {
  description: string;
  quantity: string;
  unit?: string;
  unitPrice: string;
  discountBps?: number;
  vatRateBps?: number;
  vatClassification?: string;
  projectId?: string;
  taskId?: string;
};

export function lineMoney(lines: FinanceLineInput[], currency: string) {
  const calculated = lines.map((line, index) => ({
    ...line,
    sortOrder: index,
    ...calculateLine({ quantity: line.quantity, unitPriceMinorUnits: parseDecimalToMinorUnits(line.unitPrice, currency), discountBps: line.discountBps ?? 0, vatRateBps: line.vatRateBps ?? 0 }),
  }));
  return { lines: calculated, totals: calculateDocumentTotals(calculated, currency) };
}
