import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { buttonClassName } from "@/lib/button";

const templates = [
  ["critical-ticket-escalation", "Critical Ticket Escalation", "ticket.sla_breached", "Service Desk", "Notify a manager and prepare a controlled escalation task."],
  ["client-contract-renewal", "Client Contract Renewal", "contract.expiring", "Clients", "Notify the account manager and create a renewal follow-up."],
  ["asset-warranty-expiry", "Asset Warranty Expiry", "asset.warranty_expiring", "Assets", "Create a maintenance task and notify the responsible technician."],
  ["endpoint-security-alert", "Endpoint Security Alert", "network.critical_alert_created", "Networks", "Create an alert and notify the service desk team."],
  ["employee-onboarding", "Employee Onboarding", "employee.created", "Employees", "Start an onboarding workflow and prepare account requests."],
  ["overdue-invoice-reminder", "Overdue Invoice Reminder", "finance.invoice_overdue", "Finance", "Prepare a payment reminder for review."],
  ["knowledge-article-review", "Knowledge Article Review", "knowledge.article_review_due", "Knowledge", "Notify reviewers when an article review is due."],
  ["executive-report", "Scheduled Executive Report", "reporting.schedule_due", "Reporting", "Queue an approved executive reporting workflow."],
];

export default async function AutomationTemplatesPage() {
  await requirePermission("automations.view");
  return <div className="space-y-8"><PageHeader eyebrow="Automation Engine" title="Templates" description="Templates always create drafts. Configure, review, publish and activate them explicitly." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.map(([id, name, trigger, module, description]) => <Card key={id}><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle>{name}</CardTitle><Badge tone="outline">Draft only</Badge></div></CardHeader><CardContent><p className="text-sm text-slate-600">{description}</p><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{module} · {trigger}</p><Link className={`${buttonClassName({ variant: "outline", size: "sm" })} mt-5`} href={`/administration/automations/new?template=${id}`}>Use template</Link></CardContent></Card>)}</div></div>;
}
