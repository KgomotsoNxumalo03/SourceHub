import { AutomationBuilder, defaultAutomationDefinition } from "@/components/automation-builder";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { createAutomationWorkflowAction } from "@/lib/actions/automation-engine";

export default async function NewAutomationPage() {
  await requirePermission("automations.create");
  return <div className="space-y-8"><PageHeader eyebrow="Automation Engine" title="New workflow" description="Build a draft first. Nothing is active until an authorised reviewer publishes and activates it." /><AutomationBuilder action={createAutomationWorkflowAction} initialDefinition={defaultAutomationDefinition} /></div>;
}
