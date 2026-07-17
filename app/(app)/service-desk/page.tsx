import Link from "next/link";
import { AlertTriangle, Clock3, Inbox, ShieldAlert } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { buttonClassName } from "@/lib/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, StatCard, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { ticketPriorityLabels, ticketSlaLabels, ticketSlaState, ticketSlaTone, ticketStatusLabels, ticketStatusTone } from "@/lib/tickets";
import { formatDateTime } from "@/lib/utils";

export default async function ServiceDeskPage() {
  const actor = await requirePermission("technicians.view");
  const now = new Date();

  const [myOpenTickets, unassignedTickets, overdueTickets, dueTodayTickets, breachedTickets, recentEscalations] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        assigneeId: actor.id,
        status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 10,
      include: { client: true, supportAgreement: true, slaPolicy: true },
    }),
    prisma.ticket.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        assigneeId: null,
        status: { in: ["NEW", "IN_PROGRESS"] },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 10,
      include: { client: true, supportAgreement: true, slaPolicy: true },
    }),
    prisma.ticket.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] },
      },
      orderBy: [{ resolutionDueAt: "asc" }],
      take: 20,
      include: { client: true, supportAgreement: true, slaPolicy: true },
    }),
    prisma.ticket.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] },
      },
      orderBy: [{ resolutionDueAt: "asc" }],
      take: 50,
      include: { client: true, supportAgreement: true, slaPolicy: true },
    }),
    prisma.ticket.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        slaState: "BREACHED",
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 10,
      include: { client: true, supportAgreement: true, slaPolicy: true },
    }),
    prisma.escalationExecution.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 8,
    }),
  ]);

  const dueToday = dueTodayTickets.filter(
    (ticket) => ticket.resolutionDueAt && ticket.resolutionDueAt.toDateString() === now.toDateString(),
  );
  const stats = [
    { label: "My open tickets", value: myOpenTickets.length, hint: "Assigned to you right now", icon: <Inbox className="h-5 w-5" /> },
    { label: "Unassigned queue", value: unassignedTickets.length, hint: "Ready for triage", icon: <AlertTriangle className="h-5 w-5" /> },
    { label: "Due today", value: dueToday.length, hint: "Needs attention before end of day", icon: <Clock3 className="h-5 w-5" /> },
    { label: "Breached", value: breachedTickets.length, hint: "SLA already missed", icon: <ShieldAlert className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title="Technician workspace"
        description="Track your open work, pick up the unassigned queue, and stay ahead of SLA deadlines."
        actions={
          <Link href="/tickets/new" className={buttonClassName({ variant: "primary" })}>
            Open ticket
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value.toLocaleString()} hint={stat.hint} icon={stat.icon} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>My open tickets</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {myOpenTickets.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Nothing assigned"
                  description="You do not have any active tickets assigned to you yet."
                  action={<Link href="/tickets" className={buttonClassName({ variant: "outline" })}>Browse tickets</Link>}
                />
              </div>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Ticket</TableHeadCell>
                    <TableHeadCell>Priority</TableHeadCell>
                    <TableHeadCell>SLA</TableHeadCell>
                    <TableHeadCell>Updated</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {myOpenTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell>
                        <Link href={`/tickets/${ticket.id}`} className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">
                          {ticket.referenceNumber}
                        </Link>
                        <p className="mt-1 text-sm text-sourcehub-text">{ticket.subject}</p>
                        <p className="mt-1 text-xs text-slate-500">{ticket.client?.name ?? "Internal request"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge tone="outline">{ticketPriorityLabels[ticket.priority as keyof typeof ticketPriorityLabels]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge tone={ticketSlaTone(ticketSlaState(ticket))}>{ticketSlaLabels[ticketSlaState(ticket)]}</Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(ticket.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Unassigned queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {unassignedTickets.length === 0 ? (
                <EmptyState title="Queue is clear" description="There are no unassigned tickets waiting right now." />
              ) : (
                unassignedTickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-2xl border border-sourcehub-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/tickets/${ticket.id}`} className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">
                          {ticket.referenceNumber}
                        </Link>
                        <p className="mt-1 text-sm text-sourcehub-text">{ticket.subject}</p>
                        <p className="mt-1 text-xs text-slate-500">{ticket.client?.name ?? "Internal request"}</p>
                      </div>
                      <Badge tone={ticketStatusTone(ticket.status as keyof typeof ticketStatusLabels)}>
                        {ticketStatusLabels[ticket.status as keyof typeof ticketStatusLabels]}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge tone="outline">{ticket.priority}</Badge>
                      {ticket.resolutionDueAt ? <Badge tone={ticket.resolutionDueAt < now ? "danger" : "info"}>{ticket.resolutionDueAt < now ? "Overdue" : "Due soon"}</Badge> : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent escalations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentEscalations.length === 0 ? (
                <EmptyState title="No escalations yet" description="Automation and escalation executions will appear here once SLA checks start running." />
              ) : (
                recentEscalations.map((execution) => (
                  <div key={execution.id} className="rounded-2xl border border-sourcehub-border p-4">
                    <p className="text-sm font-semibold text-sourcehub-text">{String(execution.action ?? execution.type ?? "Escalation")}</p>
                    <p className="mt-1 text-xs text-slate-500">{execution.status ?? "PENDING"}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
