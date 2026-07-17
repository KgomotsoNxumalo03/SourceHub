import Link from "next/link";

import { createAutomationRuleAction, toggleAutomationRuleAction } from "@/lib/actions/automation";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export default async function AutomationRulesPage() {
  await requirePermission("automation.view");

  const rules = await prisma.automationRule.findMany({
    where: { workspaceId: env.DEFAULT_WORKSPACE_ID },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title="Automation rules"
        description="Define repeatable service-desk automation and escalation behavior."
      />

      <Card>
        <CardHeader>
          <CardTitle>New rule</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAutomationRuleAction} className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Rule name</label>
              <Input name="name" required placeholder="Critical breach escalation" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Trigger</label>
              <Input name="trigger" required placeholder="sla.breached" />
            </div>
            <div className="space-y-2 xl:col-span-2">
              <label className="text-sm font-medium text-sourcehub-text">Description</label>
              <Textarea name="description" placeholder="Describe when and why this rule fires." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Action</label>
              <Select name="action" defaultValue="in_app_notification">
                <option value="in_app_notification">In-app notification</option>
                <option value="email_notification">Email notification</option>
                <option value="technician_notification">Technician notification</option>
                <option value="manager_notification">Manager notification</option>
                <option value="team_reassignment">Team reassignment</option>
                <option value="technician_reassignment">Technician reassignment</option>
                <option value="priority_update">Priority update</option>
                <option value="internal_note">Internal note</option>
                <option value="webhook_event">Webhook event</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Threshold percent</label>
              <Input name="thresholdPercent" type="number" min={1} max={100} defaultValue={75} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Target role</label>
              <Input name="targetRole" placeholder="Service Desk Manager" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">State</label>
              <Select name="active" defaultValue="true">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </div>
            <div className="xl:col-span-2">
              <Button type="submit">Create rule</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing rules</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No automation rules" description="Create your first escalation or ticket automation rule." />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Rule</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Trigger</TableHeadCell>
                  <TableHeadCell>Action</TableHeadCell>
                  <TableHeadCell>Updated</TableHeadCell>
                  <TableHeadCell>Toggle</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <p className="font-semibold text-sourcehub-text">{rule.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{rule.description ?? "No description"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={rule.active ? "success" : "outline"}>{rule.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell>{rule.trigger}</TableCell>
                    <TableCell>{rule.action}</TableCell>
                    <TableCell>{formatDateTime(rule.updatedAt)}</TableCell>
                    <TableCell>
                      <form action={toggleAutomationRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
                        <input type="hidden" name="active" value={String(!rule.active)} />
                        <Button type="submit" variant="ghost" size="sm">
                          {rule.active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
