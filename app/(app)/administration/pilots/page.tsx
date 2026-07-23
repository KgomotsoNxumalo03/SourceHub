import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { createPilotAction } from "@/lib/actions/pilot";
import { listPilots } from "@/lib/pilot";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, PageHeader, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PilotManagementPage() {
  const actor = await requirePermission("pilots.view");
  const pilots = await listPilots(actor);
  const canManage = actor.permissions.includes("pilots.manage");
  return <div className="space-y-6">
    <PageHeader eyebrow="Administration / Pilot programme" title="Controlled pilot management" description="Plan and evidence an internal pilot without activating production or commercial mode." />
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Safety boundary:</strong> pilots are workspace-scoped, synthetic data is labelled, and no status can enable production, billing, or external customer access.</div>
    <Card><CardHeader><CardTitle>Pilot programmes</CardTitle><CardDescription>Human approvals remain pending until an authorised person records them.</CardDescription></CardHeader><CardContent>{pilots.length ? <div className="space-y-3">{pilots.map((pilot) => <Link key={pilot.id} href={`/administration/pilots/${pilot.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sourcehub-border p-4 transition hover:border-sourcehub-primary"><div><p className="font-semibold">{pilot.name}</p><p className="mt-1 text-sm text-slate-600">{pilot.description}</p><p className="mt-1 text-xs text-slate-500">{pilot.participantUserIds?.length ?? 0} participants · {pilot.enabledModules?.length ?? 0} modules</p></div><Badge tone={pilot.status === "ACTIVE" ? "success" : pilot.status === "CANCELLED" ? "danger" : "warning"}>{String(pilot.status).replaceAll("_", " ")}</Badge></Link>)}</div> : <EmptyState title="No pilot programme" description="Create a controlled internal pilot when the scope and owner are known." />}</CardContent></Card>
    {canManage ? <Card><CardHeader><CardTitle>Create pilot programme</CardTitle><CardDescription>Use one item per line. Start in Draft; readiness and approvals are recorded separately.</CardDescription></CardHeader><CardContent><form action={createPilotAction} className="grid gap-4 lg:grid-cols-2"><Input name="name" required placeholder="Pilot name" /><Input name="startDate" required type="date" /><Textarea name="description" required minLength={10} placeholder="Purpose and boundaries" /><Input name="targetEndDate" required type="date" /><Textarea name="objectives" required placeholder="Objectives, one per line" /><Textarea name="successCriteria" required placeholder="Success criteria, one per line" /><Textarea name="enabledModules" required placeholder="Enabled modules, one per line" /><Textarea name="participantRoles" placeholder="Participant roles, one per line" /><Textarea name="participantUserIds" placeholder="Participant user IDs, one per line" /><Textarea name="knownLimitations" required placeholder="Known limitations, one per line" /><div className="lg:col-span-2"><Button type="submit">Create draft pilot</Button></div></form></CardContent></Card> : null}
  </div>;
}
