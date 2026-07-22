import Link from "next/link";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { getAutomationDashboard, listAutomationWorkflows } from "@/lib/automation-engine";
import { currentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buttonClassName } from "@/lib/button";

function dateLabel(value: any) { const date = value?.toDate ? value.toDate() : value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Never"; }
function statusTone(status: string) { return status === "ACTIVE" || status === "PUBLISHED" ? "success" : status === "ERROR" || status === "DISABLED" ? "danger" : status === "PAUSED" ? "warning" : "outline"; }

export default async function AutomationsPage() {
  const user = await currentUser();
  if (!user || (!hasPermission(user, "automations.view") && !hasPermission(user, "automation.view"))) return <EmptyState title="Access denied" description="You need automation monitoring permission to view this area." />;
  const [dashboard, workflows] = await Promise.all([getAutomationDashboard(), listAutomationWorkflows()]);
  const canCreate = hasPermission(user, "automations.create") || hasPermission(user, "automation.manage");
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Automation Engine" title="Automations" description="Design controlled workflows that run on the trusted SourceHub server." actions={<div className="flex flex-wrap gap-2"><Link className={buttonClassName({ variant: "outline", size: "sm" })} href="/administration/automations/monitoring">Monitoring</Link><Link className={buttonClassName({ variant: "outline", size: "sm" })} href="/administration/automations/templates">Templates</Link>{canCreate ? <Link className={buttonClassName({ size: "sm" })} href="/administration/automations/new">New workflow</Link> : null}</div>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Active workflows", dashboard.counts.active], ["Executions today", dashboard.counts.executionsToday], ["Waiting", dashboard.counts.waitingExecutions], ["Dead letter", dashboard.counts.deadLetterExecutions]].map(([label, value]) => <Card key={label as string}><CardContent><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-sourcehub-text">{value}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Workflow catalogue</CardTitle></CardHeader><CardContent className="p-0">{workflows.length === 0 ? <div className="p-6"><EmptyState title="No workflow drafts" description="Start with a template or create a controlled workflow from the builder." action={canCreate ? <Link className={buttonClassName({ size: "sm" })} href="/administration/automations/new">Create workflow</Link> : null} /></div> : <Table><TableHead><TableRow><TableHeadCell>Workflow</TableHeadCell><TableHeadCell>Trigger</TableHeadCell><TableHeadCell>Status</TableHeadCell><TableHeadCell>Version</TableHeadCell><TableHeadCell>Last executed</TableHeadCell><TableHeadCell>Owner</TableHeadCell></TableRow></TableHead><TableBody>{workflows.map((workflow: any) => <TableRow key={workflow.id}><TableCell><Link className="font-semibold text-sourcehub-primary hover:underline" href={`/administration/automations/${workflow.id}`}>{workflow.name}</Link><p className="mt-1 text-xs text-slate-500">{workflow.reference} · {workflow.module}</p></TableCell><TableCell>{workflow.triggerKey}</TableCell><TableCell><Badge tone={statusTone(workflow.status) as any}>{workflow.status}</Badge></TableCell><TableCell>Draft {workflow.draftVersion ?? "-"} · Published {workflow.publishedVersion ?? "-"}</TableCell><TableCell>{dateLabel(workflow.lastExecutedAt)}</TableCell><TableCell>{workflow.ownerId === user.id ? "You" : workflow.ownerId}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
    </div>
  );
}
