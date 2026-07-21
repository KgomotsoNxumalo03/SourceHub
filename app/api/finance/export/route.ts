import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET() { const actor = await currentUser(); if (!actor?.permissions.includes("finance.exports.create")) return NextResponse.json({ error: "Unauthorized" }, { status: actor ? 403 : 401 }); const invoices: any[] = await prisma.invoice.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: [{ invoiceDate: "desc" }], take: 5000 }); const csv = ["invoiceNumber,client,status,currency,totalMinorUnits,amountPaidMinorUnits,dueDate", ...invoices.map((invoice) => [invoice.invoiceNumber, invoice.clientNameSnapshot, invoice.status, invoice.currency, invoice.totalMinorUnits, invoice.amountPaidMinorUnits ?? 0, new Date(invoice.dueDate).toISOString()].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n"); return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=sourcehub-finance-invoices.csv" } }); }
