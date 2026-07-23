import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { recordUatResultAction } from "@/lib/actions/pilot";
import { getPilotDetail } from "@/lib/pilot";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PilotUatPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("pilots.view");
  const { id } = await params;
  const detail = await getPilotDetail(id, actor);
  const canUat = actor.permissions.includes("pilots.uat.manage");
  return <div className="space-y-6"><div><Link href={`/administration/pilots/${id}`} className="text-sm font-medium text-sourcehub-primary hover:underline">Back to pilot</Link><h1 className="mt-3 text-2xl font-bold">UAT workspace</h1><p className="mt-1 text-sm text-slate-600">Human testers record actual results and evidence. Cases never pass automatically.</p></div>{detail.cases.map((item: any) => <Card key={item.id}><CardHeader className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{item.title}</CardTitle><CardDescription>{item.persona} · {item.module} · {item.scenarioKey}</CardDescription></div><Badge tone={item.status === "PASS" ? "success" : item.status === "FAIL" ? "danger" : "warning"}>{item.status}</Badge></CardHeader><CardContent><div className="grid gap-4 lg:grid-cols-2"><div><p className="text-sm font-semibold">Preconditions</p><p className="mt-1 text-sm text-slate-600">{item.preconditions}</p><p className="mt-4 text-sm font-semibold">Steps</p><ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-600">{(item.steps ?? []).map((step: string) => <li key={step}>{step}</li>)}</ol><p className="mt-4 text-sm font-semibold">Expected result</p><p className="mt-1 text-sm text-slate-600">{item.expectedResult}</p></div><form action={recordUatResultAction} className="space-y-3"><input type="hidden" name="caseId" value={item.id} /><input type="hidden" name="pilotId" value={id} /><Select name="status" defaultValue={item.status} disabled={!canUat}><option>NOT_RUN</option><option>PASS</option><option>FAIL</option><option>BLOCKED</option></Select><Textarea name="actualResult" defaultValue={item.actualResult ?? ""} placeholder="Actual result" disabled={!canUat} /><Textarea name="evidence" defaultValue={item.evidence ?? ""} placeholder="Evidence reference, not sensitive data" disabled={!canUat} /><Textarea name="comments" defaultValue={item.comments ?? ""} placeholder="Comments or blocker" disabled={!canUat} /><Button type="submit" disabled={!canUat}>Record UAT result</Button></form></div></CardContent></Card>)}</div>;
}
