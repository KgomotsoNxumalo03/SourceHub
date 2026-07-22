import Link from "next/link";
import { notFound } from "next/navigation";

import { AutomationBuilder, defaultAutomationDefinition } from "@/components/automation-builder";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, PageHeader, Textarea } from "@/components/ui";
import { updateAutomationWorkflowAction, publishAutomationWorkflowAction, setAutomationStateAction, rollbackAutomationWorkflowAction, testAutomationWorkflowAction } from "@/lib/actions/automation-engine";
import { getAutomationDetail } from "@/lib/automation-engine";
import { currentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

function dateLabel(value: any) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

export default async function AutomationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await currentUser();
  if (!user || (!hasPermission(user, "automations.view") && !hasPermission(user, "automation.view"))) notFound();
  const { id } = await params;
  const query = await searchParams;
  const detail = await getAutomationDetail(id);
  if (!detail) notFound();
  const workflow: any = detail.workflow;
  const draft: any = detail.versions.find((version: any) => version.kind === "DRAFT" && Number(version.version) === Number(workflow.draftVersion)) ?? detail.versions.find((version: any) => version.kind === "DRAFT");
  const definition = draft?.definition ?? defaultAutomationDefinition;
  const canEdit = hasPermission(user, "automations.update");
  const canPublish = hasPermission(user, "automations.publish");
  const canActivate = hasPermission(user, "automations.activate");
  const canPause = hasPermission(user, "automations.pause");
  const dryRun = typeof query.dryRun === "string" ? query.dryRun : null;
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Automation Engine" title={workflow.name} description={workflow.description ?? "No description"} actions={<div className="flex flex-wrap gap-2"><Link className="text-sm font-semibold text-sourcehub-primary hover:underline" href="/administration/automations">All workflows</Link><Link className="text-sm font-semibold text-sourcehub-primary hover:underline" href="/administration/automations/monitoring">Monitoring</Link></div>} />
      <div className="flex flex-wrap items-center gap-3"><Badge tone="outline">{workflow.reference}</Badge><Badge tone={workflow.active ? "success" : workflow.status === "ERROR" ? "danger" : "warning"}>{workflow.status}</Badge><span className="text-sm text-slate-600">Draft v{workflow.draftVersion ?? "-"} · Published v{workflow.publishedVersion ?? "-"} · Updated {dateLabel(workflow.updatedAt)}</span></div>
      {canEdit ? <AutomationBuilder action={updateAutomationWorkflowAction} workflowId={id} initialDefinition={definition} initialName={workflow.name} initialDescription={workflow.description ?? ""} initialModule={workflow.module} initialStatus={workflow.status} /> : <Card><CardContent><p className="text-sm text-slate-600">You can view this workflow, but editing is restricted to authorised automation editors.</p></CardContent></Card>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Lifecycle controls</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2">
          {canPublish ? <form action={publishAutomationWorkflowAction}><input type="hidden" name="workflowId" value={id} /><Button size="sm" type="submit">Publish draft</Button></form> : null}
          {canActivate && workflow.publishedVersion && !workflow.active ? <form action={setAutomationStateAction}><input type="hidden" name="workflowId" value={id} /><input type="hidden" name="state" value="ACTIVE" /><Button size="sm" type="submit">Activate published version</Button></form> : null}
          {canPause && workflow.active ? <form action={setAutomationStateAction}><input type="hidden" name="workflowId" value={id} /><input type="hidden" name="state" value="PAUSED" /><input type="hidden" name="reason" value="Paused by workflow administrator." /><Button size="sm" variant="outline" type="submit">Pause</Button></form> : null}
        </div><p className="text-sm text-slate-600">Editing an active workflow creates a new draft. Active executions always keep using their immutable published version.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Safe dry run</CardTitle></CardHeader><CardContent><form action={testAutomationWorkflowAction} className="space-y-3"><input type="hidden" name="workflowId" value={id} /><Textarea name="contextJson" defaultValue={'{"trigger":{"eventType":"ticket.created","recordId":"demo-ticket"}}'} className="min-h-24 font-mono text-xs" aria-label="Dry run context JSON" /><Button type="submit" size="sm" variant="outline">Test without mutations</Button></form>{dryRun ? <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{dryRun}</pre> : <p className="mt-3 text-xs text-slate-500">Dry runs show condition results, proposed steps, approvals and permissions. They never create operational records.</p>}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Version history</CardTitle></CardHeader><CardContent className="space-y-3">{detail.versions.map((version: any) => {
        const canRollback = version.kind === "PUBLISHED" && canPublish;
        return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sourcehub-border p-3" key={version.id}><div><p className="font-semibold text-sourcehub-text">{version.kind} version {version.version}</p><p className="text-xs text-slate-500">Created {dateLabel(version.createdAt)}{version.rollbackOfVersion ? ` · Rollback of v${version.rollbackOfVersion}` : ""}</p></div>{canRollback ? <form action={rollbackAutomationWorkflowAction}><input type="hidden" name="workflowId" value={id} /><input type="hidden" name="version" value={version.version} /><Button type="submit" variant="ghost" size="sm">Publish as new version</Button></form> : null}</div>;
      })}</CardContent></Card>
    </div>
  );
}
