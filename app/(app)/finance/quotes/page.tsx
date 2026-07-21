import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatMinorUnits } from "@/lib/money";
import { quoteStatusLabels, financeStatusTone } from "@/lib/finance-utils";
import { buttonClassName } from "@/lib/button";
import { Badge, Card, PageHeader, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
export const dynamic = "force-dynamic";
export default async function QuotesPage() { const actor = await requirePermission("quotes.view"); const quotes: any[] = await prisma.quote.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: [{ updatedAt: "desc" }], take: 100 }); return <div className="space-y-6"><PageHeader eyebrow="Finance management" title="Quotes" description="Keep commercial proposals versioned and approval-controlled." actions={actor.permissions.includes("quotes.create") ? <Link href="/finance/quotes/new" className={buttonClassName({})}><Plus className="h-4 w-4" /> New quote</Link> : null} />{quotes.length ? <Table><TableHead><TableRow><TableHeadCell>Quote</TableHeadCell><TableHeadCell>Client</TableHeadCell><TableHeadCell>Status</TableHeadCell><TableHeadCell>Total</TableHeadCell><TableHeadCell>Expiry</TableHeadCell></TableRow></TableHead><TableBody>{quotes.map((quote) => <TableRow key={quote.id}><TableCell><Link className="font-semibold text-sourcehub-primary" href={`/finance/quotes/${quote.id}`}>{quote.quoteNumber}</Link></TableCell><TableCell>{quote.clientNameSnapshot}</TableCell><TableCell><Badge tone={financeStatusTone(quote.status)}>{quoteStatusLabels[quote.status] ?? quote.status}</Badge></TableCell><TableCell>{formatMinorUnits(Number(quote.totalMinorUnits), quote.currency)}</TableCell><TableCell>{new Date(quote.expiryDate).toLocaleDateString("en-ZA")}</TableCell></TableRow>)}</TableBody></Table> : <Card><div className="p-8 text-sm text-slate-600">No quotes yet.</div></Card>}</div>; }
