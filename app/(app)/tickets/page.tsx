import Link from "next/link";
import { AlertTriangle, BadgeCheck, Clock3, Ticket } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { buttonClassName } from "@/lib/button";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, PaginationShell, Select, StatCard, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { canCreateTickets, ticketPriorityLabels, ticketPriorityTone, ticketQueueOptions, ticketScopeWhere, ticketStatusLabels, ticketStatusOptions, ticketStatusTone } from "@/lib/tickets";
import { formatDateTime } from "@/lib/utils";
import { ticketListQuerySchema } from "@/lib/validators";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAuth();
  const query = (await searchParams) ?? {};
  const params = ticketListQuerySchema.parse({
    page: query.page ?? 1,
    pageSize: 12,
    search: query.search ?? "",
    status: query.status ?? "",
    priority: query.priority ?? "",
    category: query.category ?? "",
    queue: query.queue ?? "all",
  });

  const categories = await prisma.ticketCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const matchingUsers = params.search
    ? await prisma.user.findMany({
        where: {
          OR: [
            { firstName: { contains: params.search } },
            { lastName: { contains: params.search } },
            { email: { contains: params.search } },
            { employeeNumber: { contains: params.search } },
          ],
        },
        select: { id: true },
      })
    : [];

  const baseScope: Prisma.TicketWhereInput = ticketScopeWhere(actor);
  const statusFilter =
    params.status && ticketStatusLabels[params.status as keyof typeof ticketStatusLabels]
      ? { status: params.status as keyof typeof ticketStatusLabels }
      : {};
  const priorityFilter =
    params.priority && ticketPriorityLabels[params.priority as keyof typeof ticketPriorityLabels]
      ? { priority: params.priority as keyof typeof ticketPriorityLabels }
      : {};
  const categoryFilter = params.category ? { categoryId: params.category } : {};
  const queueFilter =
    params.queue === "mine"
      ? {
          OR: [
            { requesterId: actor.id },
            { assigneeId: actor.id },
            { createdById: actor.id },
          ],
        }
      : params.queue === "assigned"
        ? { assigneeId: actor.id }
        : params.queue === "unassigned"
          ? { assigneeId: null }
          : params.queue === "waiting"
            ? { status: "WAITING_FOR_CUSTOMER" as const }
            : params.queue === "open"
              ? { status: { in: ["NEW", "IN_PROGRESS"] as const } }
              : {};

  const searchFilter = params.search
    ? {
        OR: [
          { referenceNumber: { contains: params.search, mode: "insensitive" as const } },
          { subject: { contains: params.search, mode: "insensitive" as const } },
          { description: { contains: params.search, mode: "insensitive" as const } },
          ...(matchingUsers.length > 0
            ? [
                { requesterId: { in: matchingUsers.map((entry) => entry.id) } },
                { assigneeId: { in: matchingUsers.map((entry) => entry.id) } },
                { createdById: { in: matchingUsers.map((entry) => entry.id) } },
              ]
            : []),
        ],
      }
    : {};

  const where = {
    AND: [baseScope, statusFilter, priorityFilter, categoryFilter, queueFilter, searchFilter],
  };

  const [total, openTickets, waitingTickets, unassignedTickets, urgentTickets, tickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.count({ where: { AND: [baseScope, { status: { in: ["NEW", "IN_PROGRESS"] as const } }] } }),
    prisma.ticket.count({ where: { AND: [baseScope, { status: "WAITING_FOR_CUSTOMER" }] } }),
    prisma.ticket.count({ where: { AND: [baseScope, { assigneeId: null, status: { in: ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] as const } }] } }),
    prisma.ticket.count({ where: { AND: [baseScope, { priority: "URGENT" }] } }),
    prisma.ticket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        category: true,
        requester: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignee: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const queryParts = new URLSearchParams();
  if (params.search) queryParts.set("search", params.search);
  if (params.status) queryParts.set("status", params.status);
  if (params.priority) queryParts.set("priority", params.priority);
  if (params.category) queryParts.set("category", params.category);
  if (params.queue && params.queue !== "all") queryParts.set("queue", params.queue);
  const queryString = queryParts.toString();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title="Tickets"
        description="Create, track, and resolve requests with queue visibility for technicians and employees."
        actions={
          canCreateTickets(actor) ? (
            <Link href="/tickets/new" className={buttonClassName({ variant: "primary" })}>
              Open ticket
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={openTickets.toLocaleString()} hint="New and in-progress tickets." icon={<Ticket className="h-5 w-5" />} />
        <StatCard label="Waiting" value={waitingTickets.toLocaleString()} hint="Waiting for customer feedback." icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Unassigned" value={unassignedTickets.toLocaleString()} hint="Work that still needs an owner." icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Urgent" value={urgentTickets.toLocaleString()} hint="Highest priority tickets." icon={<BadgeCheck className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queues</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ticketQueueOptions.map((queue) => {
            const active = params.queue === queue.value || (params.queue === "all" && queue.value === "all");
            return (
              <Link
                key={queue.value}
                href={queue.value === "all" ? `/tickets${queryString ? `?${queryString}` : ""}` : `/tickets?queue=${queue.value}${queryString ? `&${queryString}` : ""}`}
                className={buttonClassName({
                  variant: active ? "primary" : "outline",
                  size: "sm",
                })}
              >
                {queue.label}
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-4 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr_0.9fr_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Search</label>
              <Input name="search" defaultValue={params.search} placeholder="Reference, subject, requester, or assignee" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Status</label>
              <Select name="status" defaultValue={params.status}>
                <option value="">All statuses</option>
                {ticketStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Priority</label>
              <Select name="priority" defaultValue={params.priority}>
                <option value="">All priorities</option>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Category</label>
              <Select name="category" defaultValue={params.category}>
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Queue</label>
              <Select name="queue" defaultValue={params.queue}>
                {ticketQueueOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" variant="secondary" className="w-full">
                Apply
              </Button>
              <Link href="/tickets" className={buttonClassName({ variant: "ghost" })}>
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No tickets found"
                description="Use different filters or open a new ticket to get started."
                action={
                  canCreateTickets(actor) ? (
                    <Link href="/tickets/new" className={buttonClassName({ variant: "primary" })}>
                      Open ticket
                    </Link>
                  ) : null
                }
              />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Ticket</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Priority</TableHeadCell>
                  <TableHeadCell>Requester</TableHeadCell>
                  <TableHeadCell>Assignee</TableHeadCell>
                  <TableHeadCell>Updated</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <Link href={`/tickets/${ticket.id}`} className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">
                        {ticket.referenceNumber}
                      </Link>
                      <p className="mt-1 max-w-2xl text-sm text-sourcehub-text">{ticket.subject}</p>
                      <p className="mt-1 text-xs text-slate-500">{ticket.category?.name ?? "Uncategorised"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabels[ticket.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={ticketPriorityTone(ticket.priority)}>{ticketPriorityLabels[ticket.priority]}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sourcehub-text">
                        {ticket.requester.firstName} {ticket.requester.lastName}
                      </p>
                      <p className="text-xs text-slate-500">{ticket.requester.email}</p>
                    </TableCell>
                    <TableCell>
                      {ticket.assignee ? (
                        <>
                          <p className="font-medium text-sourcehub-text">
                            {ticket.assignee.firstName} {ticket.assignee.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{ticket.assignee.email}</p>
                        </>
                      ) : (
                        <span className="text-slate-500">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(ticket.updatedAt)}</TableCell>
                    <TableCell>
                      <Link href={`/tickets/${ticket.id}`} className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
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

      <PaginationShell page={params.page} totalPages={totalPages} basePath="/tickets" query={queryString} />
    </div>
  );
}
