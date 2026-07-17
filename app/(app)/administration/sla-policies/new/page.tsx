import Link from "next/link";

import { createSlaPolicyAction } from "@/lib/actions/sla";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui";

const weekdayOptions = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

export default async function NewSlaPolicyPage() {
  await requirePermission("slaPolicies.manage");

  const [clients, categories, agreements] = await Promise.all([
    prisma.client.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } }),
    prisma.ticketCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.supportAgreement.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title="New SLA policy"
        description="Create a policy with work hours, pause conditions, and optional client-specific scoping."
        actions={
          <Link href="/administration/sla-policies" className={buttonClassName({ variant: "outline" })}>
            Back to SLA policies
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Policy details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createSlaPolicyAction} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="name" className="text-sm font-medium text-sourcehub-text">Policy name *</label>
                <Input id="name" name="name" required placeholder="Standard Support" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="description" className="text-sm font-medium text-sourcehub-text">Description</label>
                <Textarea id="description" name="description" placeholder="Use for standard business-hour support requests." />
              </div>
              <div className="space-y-2">
                <label htmlFor="active" className="text-sm font-medium text-sourcehub-text">State</label>
                <Select id="active" name="active" defaultValue="true">
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="priority" className="text-sm font-medium text-sourcehub-text">Priority</label>
                <Select id="priority" name="priority" defaultValue="">
                  <option value="">Any priority</option>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="clientId" className="text-sm font-medium text-sourcehub-text">Client</label>
                <Select id="clientId" name="clientId" defaultValue="">
                  <option value="">Workspace-wide</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="supportAgreementId" className="text-sm font-medium text-sourcehub-text">Support agreement</label>
                <Select id="supportAgreementId" name="supportAgreementId" defaultValue="">
                  <option value="">Any agreement</option>
                  {agreements.map((agreement) => (
                    <option key={agreement.id} value={agreement.id}>{agreement.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="categoryId" className="text-sm font-medium text-sourcehub-text">Ticket category</label>
                <Select id="categoryId" name="categoryId" defaultValue="">
                  <option value="">Any category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="firstResponseMinutes" className="text-sm font-medium text-sourcehub-text">First response minutes *</label>
                  <Input id="firstResponseMinutes" name="firstResponseMinutes" type="number" min={1} defaultValue={60} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="resolutionMinutes" className="text-sm font-medium text-sourcehub-text">Resolution minutes *</label>
                  <Input id="resolutionMinutes" name="resolutionMinutes" type="number" min={1} defaultValue={480} required />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="businessHoursStart" className="text-sm font-medium text-sourcehub-text">Business start *</label>
                  <Input id="businessHoursStart" name="businessHoursStart" defaultValue={env.DEFAULT_BUSINESS_START_TIME} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="businessHoursEnd" className="text-sm font-medium text-sourcehub-text">Business end *</label>
                  <Input id="businessHoursEnd" name="businessHoursEnd" defaultValue={env.DEFAULT_BUSINESS_END_TIME} required />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="workingDays" className="text-sm font-medium text-sourcehub-text">Working days</label>
                <Select id="workingDays" name="workingDays" multiple size={7} className="h-auto min-h-36">
                  {weekdayOptions.map((day) => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </Select>
                <p className="text-xs text-slate-500">Hold Ctrl or Cmd to select multiple days.</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="publicHolidays" className="text-sm font-medium text-sourcehub-text">Public holidays</label>
                <Textarea id="publicHolidays" name="publicHolidays" placeholder="2026-01-01, 2026-04-03" />
              </div>
              <div className="space-y-2">
                <label htmlFor="pauseConditions" className="text-sm font-medium text-sourcehub-text">Pause conditions</label>
                <Textarea id="pauseConditions" name="pauseConditions" placeholder="Waiting for customer, external vendor dependency" />
              </div>
              <div className="space-y-2">
                <label htmlFor="escalationRules" className="text-sm font-medium text-sourcehub-text">Escalation rules</label>
                <Textarea id="escalationRules" name="escalationRules" placeholder="75% response target, 90% manager notification" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit">Create policy</Button>
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
