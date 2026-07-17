import Link from "next/link";

import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Select, StatCard, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { calculateClientHealth, clientHealthReason, calculateContractStatus } from "@/lib/crm";
import { formatDate, formatDateTime } from "@/lib/utils";

const statusTone: Record<string, "success" | "warning" | "danger" | "info"> = {
  ACTIVE: "success",
  ONBOARDING: "info",
  PAUSED: "warning",
  FORMER: "danger",
};

const healthTone: Record<string, "success" | "warning" | "danger" | "info"> = {
  EXCELLENT: "success",
  GOOD: "info",
  WATCH: "warning",
  RISK: "danger",
  CRITICAL: "danger",
  INACTIVE: "info",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("clients.view");
  const query = (await searchParams) ?? {};
  const search = String(query.search ?? "");
  const status = String(query.status ?? "");

  const clients = await prisma.client.findMany({
    where: {
      workspaceId: env.DEFAULT_WORKSPACE_ID,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { legalName: { contains: search, mode: "insensitive" as const } },
              { code: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: "asc" }],
    include: {
      contacts: true,
      sites: true,
      supportAgreements: true,
      contracts: true,
      billingProfiles: true,
    },
  });

  const summaries = await Promise.all(
    clients.map(async (client) => {
      const [openTickets, overdueTickets, breachedTickets, expiringContracts, portalUsers] = await Promise.all([
        prisma.ticket.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, clientId: client.id, status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] } } }),
        prisma.ticket.count({
          where: {
            workspaceId: env.DEFAULT_WORKSPACE_ID,
            clientId: client.id,
            status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] },
            resolutionDueAt: { lt: new Date() },
          },
        }),
        prisma.ticket.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, clientId: client.id, slaState: "BREACHED" } }),
        prisma.contract.count({
          where: {
            workspaceId: env.DEFAULT_WORKSPACE_ID,
            clientId: client.id,
            endDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) },
          },
        }),
        prisma.portalAccount.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, clientId: client.id } }),
      ]);

      return {
        client,
        openTickets,
        overdueTickets,
        breachedTickets,
        expiringContracts,
        portalUsers,
        health: calculateClientHealth({
          status: client.status,
          openTickets,
          overdueTickets,
          openBreaches: breachedTickets,
          expiringContracts,
          portalUsers,
        }),
      };
    }),
  );

  const totals = {
    active: clients.filter((client) => client.status === "ACTIVE").length,
    onboarding: clients.filter((client) => client.status === "ONBOARDING").length,
    paused: clients.filter((client) => client.status === "PAUSED").length,
    former: clients.filter((client) => client.status === "FORMER").length,
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Clients & CRM"
        title="Clients"
        description="Track account health, support coverage, contracts, contacts, sites, and billing in one place."
        actions={
          <Link href="/clients/new" className={buttonClassName({ variant: "primary" })}>
            New client
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active" value={totals.active.toLocaleString()} hint="Current managed accounts" />
        <StatCard label="Onboarding" value={totals.onboarding.toLocaleString()} hint="Clients still onboarding" />
        <StatCard label="Paused" value={totals.paused.toLocaleString()} hint="Temporarily paused accounts" />
        <StatCard label="Former" value={totals.former.toLocaleString()} hint="Archived client records" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-4 lg:grid-cols-[1.2fr_0.6fr_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Search</label>
              <Input name="search" defaultValue={search} placeholder="Client name, legal name, or code" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Status</label>
              <Select name="status" defaultValue={status}>
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ONBOARDING">Onboarding</option>
                <option value="PAUSED">Paused</option>
                <option value="FORMER">Former</option>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className={buttonClassName({ variant: "secondary", className: "w-full" })}>
                Apply
              </button>
              <Link href="/clients" className={buttonClassName({ variant: "ghost" })}>
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {summaries.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No clients found"
                description="Add your first client to start tracking accounts, support agreements, and billing details."
                action={
                  <Link href="/clients/new" className={buttonClassName({ variant: "primary" })}>
                    New client
                  </Link>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Client</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Health</TableHeadCell>
                  <TableHeadCell>Contracts</TableHeadCell>
                  <TableHeadCell>Contacts</TableHeadCell>
                  <TableHeadCell>Support</TableHeadCell>
                  <TableHeadCell>Updated</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaries.map(({ client, health, openTickets, overdueTickets, breachedTickets, expiringContracts, portalUsers }) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Link href={`/clients/${client.id}`} className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">
                        {client.name}
                      </Link>
                      <p className="mt-1 text-sm text-slate-500">{client.code}</p>
                      <p className="mt-1 text-xs text-slate-500">{client.legalName ?? "No legal name captured"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTone[client.status] ?? "info"}>{client.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={healthTone[health] ?? "info"}>{health}</Badge>
                      <p className="mt-2 text-xs text-slate-500">{clientHealthReason({ status: client.status, overdueTickets, openBreaches: breachedTickets, expiringContracts, portalUsers })}</p>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>{client.contracts.length} total</p>
                        <p className="text-xs text-slate-500">{expiringContracts} expiring soon</p>
                      </div>
                    </TableCell>
                    <TableCell>{client.contacts.length}</TableCell>
                    <TableCell>{client.supportAgreements.length}</TableCell>
                    <TableCell>{formatDateTime(client.updatedAt)}</TableCell>
                    <TableCell>
                      <Link href={`/clients/${client.id}`} className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
                        View
                      </Link>
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
