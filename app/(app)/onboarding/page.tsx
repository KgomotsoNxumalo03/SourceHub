import { currentUser } from "@/lib/auth";
import { getTenantCommercialData } from "@/lib/commercial";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CommercialOnboardingPage() {
  const actor = await currentUser();
  if (!actor) return <div className="rounded-2xl border border-sourcehub-border bg-white p-6 text-sm">Sign in to continue onboarding.</div>;
  const data = await getTenantCommercialData(actor);
  const onboarding = data.onboarding;
  const steps = ["organization", "office", "branding", "members", "security", "integrations", "completion"];
  return <div className="space-y-6"><PageHeader eyebrow="Tenant onboarding" title={`Set up ${data.context.name}`} description="Save progress safely, skip optional steps, and complete the final readiness checklist before using commercial features." actions={<Badge tone={onboarding?.status === "READY" ? "success" : "warning"}>{onboarding?.status ?? "IN_PROGRESS"}</Badge>} /><Card><CardHeader><CardTitle>Setup checklist</CardTitle></CardHeader><CardContent className="space-y-3">{steps.map((step) => <div className="flex items-center justify-between rounded-xl border border-sourcehub-border px-4 py-3 text-sm" key={step}><span className="capitalize">{step}</span><Badge tone={onboarding?.completedSteps?.includes(step) ? "success" : "outline"}>{onboarding?.completedSteps?.includes(step) ? "Complete" : "Available"}</Badge></div>)}</CardContent></Card><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Commercial activation is controlled by the server readiness gate. Completing onboarding does not activate billing or change existing internal SourceHub access.</div></div>;
}
