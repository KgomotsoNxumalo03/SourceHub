import Link from "next/link";
import { notFound } from "next/navigation";

import { updateSlaPolicyAction, toggleSlaPolicyAction } from "@/lib/actions/sla";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui";

const weekdayOptions = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

export default async function SlaPolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("slaPolicies.view");
  await requirePermission("slaPolicies.manage");
  const { id } = await params;

  const [policy, clients, categories, agreements] = await Promise.all([
    prisma.slaPolicy.findUnique({ where: { id } }),
    prisma.client.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } }),
    prisma.ticketCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.supportAgreement.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, active: true }, orderBy: { name: "asc" } }),
  ]);

  if (!policy) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title={policy.name}
        description="Edit the SLA policy, activation state, and ticket scoping rules."
        actions={
          <div className="flex items-center gap-3">
            <Link href="/administration/sla-policies" className={buttonClassName({ variant: "outline" })}>
              Back to policies
            </Link>
            <form action={toggleSlaPolicyAction}>
              <input type="hidden" name="id" value={policy.id} />
              <input type="hidden" name="active" value={String(!policy.active)} />
              <Button type="submit" variant="secondary">
                {policy.active ? "Deactivate" : "Activate"}
              </Button>
            </form>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <Badge tone={policy.active ? "success" : "outline"}>{policy.active ? "Active" : "Inactive"}</Badge>
        <Badge tone="outline">{policy.clientId ? "Client-specific" : "Workspace-wide"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Policy details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateSlaPolicyAction} className="space-y-6">
            <input type="hidden" name="id" value={policy.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="name" className="text-sm font-medium text-sourcehub-text">Policy name *</label>
                <Input id="name" name="name" required defaultValue={policy.name} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="description" className="text-sm font-medium text-sourcehub-text">Description</label>
                <Textarea id="description" name="description" defaultValue={policy.description ?? ""} />
              </div>
              <div className="space-y-2">
                <label htmlFor="active" className="text-sm font-medium text-sourcehub-text">State</label>
                <Select id="active" name="active" defaultValue={String(policy.active)}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="priority" className="text-sm font-medium text-sourcehub-text">Priority</label>
                <Select id="priority" name="priority" defaultValue={policy.priority ?? ""}>
                  <option value="">Any priority</option>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="clientId" className="text-sm font-medium text-sourcehub-text">Client</label>
                <Select id="clientId" name="clientId" defaultValue={policy.clientId ?? ""}>
                  <option value="">Workspace-wide</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="supportAgreementId" className="text-sm font-medium text-sourcehub-text">Support agreement</label>
                <Select id="supportAgreementId" name="supportAgreementId" defaultValue={policy.supportAgreementId ?? ""}>
                  <option value="">Any agreement</option>
                  {agreements.map((agreement) => (
                    <option key={agreement.id} value={agreement.id}>{agreement.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="categoryId" className="text-sm font-medium text-sourcehub-text">Ticket category</label>
                <Select id="categoryId" name="categoryId" defaultValue={policy.categoryId ?? ""}>
                  <option value="">Any category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="firstResponseMinutes" className="text-sm font-medium text-sourcehub-text">First response minutes *</label>
                  <Input id="firstResponseMinutes" name="firstResponseMinutes" type="number" min={1} defaultValue={policy.firstResponseMinutes} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="resolutionMinutes" className="text-sm font-medium text-sourcehub-text">Resolution minutes *</label>
                  <Input id="resolutionMinutes" name="resolutionMinutes" type="number" min={1} defaultValue={policy.resolutionMinutes} required />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="businessHoursStart" className="text-sm font-medium text-sourcehub-text">Business start *</label>
                  <Input id="businessHoursStart" name="businessHoursStart" defaultValue={policy.businessHoursStart} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="businessHoursEnd" className="text-sm font-medium text-sourcehub-text">Business end *</label>
                  <Input id="businessHoursEnd" name="businessHoursEnd" defaultValue={policy.businessHoursEnd} required />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="workingDays" className="text-sm font-medium text-sourcehub-text">Working days</label>
                <Select id="workingDays" name="workingDays" multiple size={7} defaultValue={policy.workingDays.map(String)} className="h-auto min-h-36">
                  {weekdayOptions.map((day) => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="publicHolidays" className="text-sm font-medium text-sourcehub-text">Public holidays</label>
                <Textarea id="publicHolidays" name="publicHolidays" defaultValue={policy.publicHolidays.join(", ")} />
              </div>
              <div className="space-y-2">
                <label htmlFor="pauseConditions" className="text-sm font-medium text-sourcehub-text">Pause conditions</label>
                <Textarea id="pauseConditions" name="pauseConditions" defaultValue={policy.pauseConditions.join(", ")} />
              </div>
              <div className="space-y-2">
                <label htmlFor="escalationRules" className="text-sm font-medium text-sourcehub-text">Escalation rules</label>
                <Textarea id="escalationRules" name="escalationRules" defaultValue={policy.escalationRules.join(", ")} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit">Save policy</Button>
              <Link href="/administration/sla-policies" className={buttonClassName({ variant: "ghost" })}>
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
