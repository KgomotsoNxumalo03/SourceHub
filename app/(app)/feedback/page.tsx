import Link from "next/link";

import { requireAuth } from "@/lib/auth";
import { submitFeedbackAction } from "@/lib/actions/operations";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  await requireAuth();
  const params = await searchParams;
  return <div className="max-w-3xl space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-sourcehub-primary">Product feedback</p><h1 className="mt-2 text-2xl font-bold">Help us improve SourceHub</h1><p className="mt-1 text-sm text-slate-600">Share a focused observation. Do not include passwords, keys, customer exports, or other secrets.</p></div>
    {params.submitted ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Feedback submitted to the internal product queue.</div> : null}
    <Card><CardHeader><CardTitle>Submit feedback</CardTitle><CardDescription>Private feedback is visible to the operations team only.</CardDescription></CardHeader><CardContent><form action={submitFeedbackAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-medium">Category<Select name="category" required defaultValue="USABILITY"><option>BUG</option><option>FEATURE</option><option>USABILITY</option><option>PERFORMANCE</option><option>DOCUMENTATION</option><option>GENERAL</option></Select></label><label className="space-y-1 text-sm font-medium">Module<Input name="module" required maxLength={80} placeholder="Tickets, Reports, Mobile" /></label></div>
      <label className="block space-y-1 text-sm font-medium">What happened?<Textarea name="description" required minLength={20} maxLength={5000} placeholder="Describe the observed behaviour and why it matters." /></label>
      <div className="grid gap-4 sm:grid-cols-3"><label className="space-y-1 text-sm font-medium">Impact<Select name="impact" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></Select></label><label className="space-y-1 text-sm font-medium">Frequency<Select name="frequency" defaultValue="OCCASIONAL"><option>ONCE</option><option>OCCASIONAL</option><option>FREQUENT</option><option>ALWAYS</option></Select></label><label className="space-y-1 text-sm font-medium">Visibility<Select name="visibility" defaultValue="PRIVATE"><option>PRIVATE</option><option>WORKSPACE</option></Select></label></div>
      <div className="flex items-center justify-between gap-3"><Link href="/administration/operations" className="text-sm font-medium text-sourcehub-primary hover:underline">Operations dashboard</Link><Button type="submit">Submit feedback</Button></div>
    </form></CardContent></Card>
  </div>;
}
