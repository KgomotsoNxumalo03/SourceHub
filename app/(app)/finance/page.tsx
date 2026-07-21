import Link from "next/link";
import { Banknote, FileText, ReceiptText, ShieldCheck, ShoppingCart, WalletCards } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatMinorUnits } from "@/lib/money";
import { buttonClassName } from "@/lib/button";
import { Card, CardContent, PageHeader, StatCard } from "@/components/ui";
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  await requirePermission("finance.dashboard.view");
  const workspaceId = env.DEFAULT_WORKSPACE_ID;
  const [draftQuotes, quoteApprovals, openInvoices, overdueInvoices, pendingExpenses, pendingOrders, paid] = await Promise.all([
    prisma.quote.count({ where: { workspaceId, status: "DRAFT" } }),
    prisma.quote.count({ where: { workspaceId, status: "PENDING_APPROVAL" } }),
    prisma.invoice.findMany({ where: { workspaceId, status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } }, take: 100 }),
    prisma.invoice.count({ where: { workspaceId, status: "OVERDUE" } }),
    prisma.expense.count({ where: { workspaceId, status: "PENDING_APPROVAL" } }),
    prisma.purchaseOrder.count({ where: { workspaceId, status: { in: ["REQUESTED", "PENDING_APPROVAL"] } } }),
    prisma.payment.findMany({ where: { workspaceId, status: { in: ["RECORDED", "PARTIALLY_ALLOCATED", "ALLOCATED"] } }, take: 100 }),
  ]);
  const outstanding = openInvoices.reduce((sum: number, invoice: any) => sum + Math.max(0, Number(invoice.totalMinorUnits) - Number(invoice.amountPaidMinorUnits ?? 0)), 0);
  const received = paid.reduce((sum: number, payment: any) => sum + Number(payment.amountMinorUnits ?? 0), 0);
  return <div className="space-y-6">
    <PageHeader eyebrow="Finance management" title="Finance" description="Quotes, invoices, collections, expenses, purchasing, and budgets in one controlled workspace." actions={<Link href="/finance/quotes/new" className={buttonClassName({})}>New quote</Link>} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Outstanding invoices" value={formatMinorUnits(outstanding)} hint="Issued less allocations" icon={<ReceiptText className="h-5 w-5" />} />
      <StatCard label="Overdue invoices" value={String(overdueInvoices)} hint="Needs collection follow-up" icon={<Banknote className="h-5 w-5" />} />
      <StatCard label="Quotes to approve" value={String(quoteApprovals)} hint={`${draftQuotes} still in draft`} icon={<FileText className="h-5 w-5" />} />
      <StatCard label="Recorded payments" value={formatMinorUnits(received)} hint="Awaiting or completed allocations" icon={<WalletCards className="h-5 w-5" />} />
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[ ["Quotes", "/finance/quotes", "Create, approve, accept, and convert"], ["Invoices", "/finance/invoices", "Issue private, immutable documents"], ["Expenses", "/finance/expenses", `${pendingExpenses} awaiting approval`], ["Purchasing", "/finance/purchase-orders", `${pendingOrders} awaiting action`], ["Payments", "/finance/payments", "Record and allocate receipts"], ["Suppliers", "/finance/suppliers", "Supplier master data"], ["Budgets", "/finance/budgets", "Track approved spend"], ["Settings", "/finance/settings", "VAT, numbering, and terms"] ].map(([label, href, description]) => <Link key={href} href={href}><Card className="h-full transition hover:-translate-y-0.5 hover:border-sourcehub-primary"><CardContent><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-sourcehub-primary" /><h2 className="font-semibold">{label}</h2></div><p className="mt-2 text-sm text-slate-600">{description}</p></CardContent></Card></Link>)}
    </div>
    <Card><CardContent><div className="flex items-start gap-3"><ShoppingCart className="mt-0.5 h-5 w-5 text-sourcehub-primary" /><div><h2 className="font-semibold">Financial controls</h2><p className="mt-1 text-sm text-slate-600">Totals are recalculated on the server, numbering is transactional, issued invoices are protected from edits, and finance documents remain private.</p></div></div></CardContent></Card>
  </div>;
}
