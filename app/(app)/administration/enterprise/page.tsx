import { requirePermission } from "@/lib/auth";
import { getEnterpriseSecuritySummary } from "@/lib/enterprise";
import { PageHeader } from "@/components/ui";
import { EnterpriseConsole } from "@/components/enterprise/enterprise-console";

export const dynamic = "force-dynamic";
export default async function EnterpriseAdministrationPage() { await requirePermission("enterprise.settings.view"); const summary = await getEnterpriseSecuritySummary(); return <div className="space-y-6"><PageHeader eyebrow="Administration / Enterprise" title="Enterprise controls" description="Identity, API, office, maintenance, and resilience readiness for the Source IT Services workspace." /><EnterpriseConsole initialSummary={summary} /></div>; }
