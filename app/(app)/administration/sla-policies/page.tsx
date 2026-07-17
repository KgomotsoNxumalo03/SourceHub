import Link from "next/link";

import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { ticketPriorityLabels } from "@/lib/tickets";
import { formatDateTime } from "@/lib/utils";
import { toggleSlaPolicyAction } from "@/lib/actions/sla";

export default async function SlaPoliciesPage() {
  await requirePermission("slaPolicies.view");

  const policies = await prisma.slaPolicy.findMany({
    where: { workspaceId: env.DEFAULT_WORKSPACE_ID },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title="SLA policies"
        description="Define response and resolution targets, working hours, pause conditions, and escalation behavior."
        actions={
          <Link href="/administration/sla-policies/new" className={buttonClassName({ variant: "primary" })}>
            New policy
          </Link>
        }
      />

      <Card>
        <CardContent className="p-0">
          {policies.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No SLA policies yet"
                description="Create your first policy to automatically set ticket deadlines."
                action={
                  <Link href="/administration/sla-policies/new" className={buttonClassName({ variant: "primary" })}>
                    New policy
                  </Link>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Policy</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Scope</TableHeadCell>
                  <TableHeadCell>Targets</TableHeadCell>
                  <TableHeadCell>Updated</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <Link href={`/administration/sla-policies/${policy.id}`} className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">
                        {policy.name}
                      </Link>
                      <p className="mt-1 text-sm text-slate-500">{policy.description ?? "No description"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={policy.active ? "success" : "outline"}>{policy.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      <div className="space-y-1">
                        <p>{policy.clientId ? "Client-specific" : "Workspace-wide"}</p>
                        <p>{policy.priority ? ticketPriorityLabels[policy.priority as keyof typeof ticketPriorityLabels] ?? policy.priority : "Any priority"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      <div className="space-y-1">
                        <p>First response: {policy.firstResponseMinutes} min</p>
                        <p>Resolution: {policy.resolutionMinutes} min</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(policy.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link href={`/administration/sla-policies/${policy.id}`} className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
                          Edit
                        </Link>
                        <form action={toggleSlaPolicyAction}>
                          <input type="hidden" name="id" value={policy.id} />
                          <input type="hidden" name="active" value={String(!policy.active)} />
                          <button type="submit" className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
                            {policy.active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      </div>
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
