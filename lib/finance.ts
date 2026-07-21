import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin, prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { calculateDocumentTotals, calculateLine, parseDecimalToMinorUnits, dateForPaymentTerms } from "@/lib/money";
import { financeNumberPrefix, invoiceBalance } from "@/lib/finance-utils";
import type { FinanceLineInput } from "@/lib/finance-utils";

export const financeWorkspaceId = env.DEFAULT_WORKSPACE_ID;

export function calculateFinanceLines(lines: FinanceLineInput[], currency = env.FINANCE_DEFAULT_CURRENCY) {
  const calculated = lines.map((line, index) => ({
    ...line,
    sortOrder: index,
    ...calculateLine({
      quantity: line.quantity,
      unitPriceMinorUnits: parseDecimalToMinorUnits(line.unitPrice, currency),
      discountBps: line.discountBps ?? 0,
      vatRateBps: line.vatRateBps ?? env.FINANCE_DEFAULT_VAT_RATE_BPS,
    }),
  }));
  return { lines: calculated, totals: calculateDocumentTotals(calculated, currency) };
}

export async function numberNextInTransaction(
  transaction: FirebaseFirestore.Transaction,
  type: "quote" | "invoice" | "creditNote" | "purchaseOrder" | "payment",
  workspaceId = financeWorkspaceId,
) {
  const year = new Date().getUTCFullYear();
  const counterId = `${workspaceId}:${type}:${year}`;
  const ref = firestoreAdmin.collection(collectionNames.financialNumberCounters).doc(counterId);
  const snapshot = await transaction.get(ref);
  const nextNumber = snapshot.exists ? Number(snapshot.data()?.nextNumber ?? 1) : 1;
  transaction.set(ref, { id: counterId, workspaceId, type, year, nextNumber: nextNumber + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const prefix = financeNumberPrefix(type);
  return `${prefix}-${year}-${String(nextNumber).padStart(5, "0")}`;
}

export function isImmutableFinanceDocument(status: string) {
  return ["SENT", "VIEWED", "PARTIALLY_PAID", "PAID", "OVERDUE", "ISSUED", "APPLIED", "REVERSED", "VOIDED", "WRITTEN_OFF"].includes(status);
}

export function documentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function invoiceBalanceFromRecord(invoice: { totalMinorUnits: number; amountPaidMinorUnits?: number }) {
  return invoiceBalance(invoice.totalMinorUnits, invoice.amountPaidMinorUnits ?? 0);
}

export function defaultDueDate(invoiceDate: Date, paymentTermsDays = env.FINANCE_DEFAULT_PAYMENT_TERMS_DAYS) {
  return dateForPaymentTerms(invoiceDate, paymentTermsDays);
}

export async function ensureFinanceSettings(actorId: string) {
  const id = `${financeWorkspaceId}:default`;
  const existing = await prisma.financeSetting.findUnique({ where: { id } });
  if (existing) return existing;
  const data = {
    id, workspaceId: financeWorkspaceId, legalCompanyName: env.DEFAULT_COMPANY_NAME, tradingName: env.DEFAULT_TRADING_NAME,
    registrationNumber: null, vatNumber: null, companyAddress: "South Africa", billingEmail: env.DEFAULT_SUPPORT_EMAIL,
    telephone: env.DEFAULT_CONTACT_NUMBER, website: env.DEFAULT_WEBSITE, defaultCurrency: env.FINANCE_DEFAULT_CURRENCY,
    defaultVatRateBps: env.FINANCE_DEFAULT_VAT_RATE_BPS, defaultPaymentTermsDays: env.FINANCE_DEFAULT_PAYMENT_TERMS_DAYS,
    quoteValidityDays: env.FINANCE_QUOTE_VALIDITY_DAYS, quoteNumberFormat: "Q-{YYYY}-{SEQ}", invoiceNumberFormat: "INV-{YYYY}-{SEQ}",
    creditNoteNumberFormat: "CN-{YYYY}-{SEQ}", purchaseOrderNumberFormat: "PO-{YYYY}-{SEQ}", expenseNumberFormat: "EXP-{YYYY}-{SEQ}",
    financialYearStart: "03-01", invoiceFooter: null, bankingDetailDisplay: false, approvalThresholds: null,
    createdBy: actorId, updatedBy: actorId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  };
  await prisma.financeSetting.create({ data });
  return data;
}

export function financeLineFromQuote(line: any) {
  return {
    description: String(line.description), quantity: String(line.quantity), unit: line.unit ?? "", unitPrice: String(line.unitPrice ?? "0"),
    discountBps: Number(line.discountBps ?? 0), vatRateBps: Number(line.vatRateBps ?? 0), vatClassification: line.vatClassification ?? "STANDARD",
    projectId: line.projectId ?? "", taskId: line.taskId ?? "",
  } satisfies FinanceLineInput;
}

export function newFinanceId() { return randomUUID(); }
