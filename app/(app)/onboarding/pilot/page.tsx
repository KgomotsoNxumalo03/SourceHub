import { requireAuth } from "@/lib/auth";
import { savePilotOnboardingAction } from "@/lib/actions/pilot";
import { getOnboardingProgress } from "@/lib/pilot";
import { pilotPersonas } from "@/lib/pilot-core";
import { navigationItems } from "@/lib/navigation";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PilotOnboardingPage() {
  const actor = await requireAuth();
  const progress = await getOnboardingProgress(actor) as Record<string, any>;
  const persona = pilotPersonas.find((item) => actor.roles.some((role) => role.name.toLowerCase().includes(item.key.replaceAll("-", " ").split(" ")[0]))) ?? pilotPersonas.find((item) => item.key === "employee")!;
  const available = navigationItems.filter((item) => !item.permission || actor.permissions.includes(item.permission)).slice(0, 12);
  const steps = ["Review your role and restrictions", "Open one assigned workflow", "Read the security guidance", "Try the optional product tour", "Submit feedback when ready"];
  return <div className="space-y-6"><PageHeader eyebrow="Pilot onboarding" title={`Welcome, ${actor.firstName}`} description="This checklist records onboarding readiness only. It is not employee productivity monitoring." /><Card><CardHeader><CardTitle>{persona.name}</CardTitle><CardDescription>{persona.restrictions}</CardDescription></CardHeader><CardContent><p className="text-sm text-slate-600">Responsibilities: {persona.workflows.join(", ")}.</p><p className="mt-3 text-sm text-slate-600">Security guidance: never submit passwords, tokens, customer exports, financial details, AI prompts, or uploaded documents through feedback or demo workflows.</p></CardContent></Card><Card><CardHeader><CardTitle>Role-based readiness</CardTitle><CardDescription>Completed items can be safely resumed later.</CardDescription></CardHeader><CardContent><form action={savePilotOnboardingAction} className="space-y-3"><input type="hidden" name="currentStep" value="pilot-readiness" />{steps.map((step) => <label key={step} className="flex items-center gap-3 rounded-xl border border-sourcehub-border p-3 text-sm"><input type="checkbox" name="completedStep" value={step} defaultChecked={progress.completedSteps?.includes(step)} />{step}</label>)}<Button type="submit">Save onboarding progress</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Available modules</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{available.map((item) => <div key={item.href} className="rounded-xl border border-sourcehub-border p-3 text-sm"><p className="font-semibold">{item.label}</p><p className="mt-1 text-slate-600">Available for your current permissions.</p></div>)}</CardContent></Card></div>;
}
