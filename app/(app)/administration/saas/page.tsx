import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CommercialConsole } from "@/components/commercial/commercial-console";

export const dynamic = "force-dynamic";

export default async function CommercialAdministrationPage() {
  await requirePermission("commercial.platform.view");
  return <div className="space-y-6"><PageHeader eyebrow="Platform administration / SaaS readiness" title="Commercial SaaS operations" description="Tenant provisioning, readiness controls, plans, billing foundations and lifecycle operations. Commercial mode remains disabled until approved." /><CommercialConsole /></div>;
}
