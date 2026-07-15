import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, Paperclip, UserCircle2 } from "lucide-react";

import { addInternalNoteAction, addPublicReplyAction, assignTicketAction, updateTicketAction } from "@/lib/actions/tickets";
import { buttonClassName } from "@/lib/button";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Select, Textarea } from "@/components/ui";
import {
  canAssignTickets,
  canCommentOnTickets,
  canEditTickets,
  canCreateTickets,
  canSeeAllTickets,
  ticketPriorityLabels,
  ticketPriorityOptions,
  ticketPriorityTone,
  ticketStatusLabels,
  ticketStatusOptions,
  ticketStatusTone,
} from "@/lib/tickets";
import { formatDateTime, formatFileSize } from "@/lib/utils";

async function loadTicket(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      category: true,
      requester: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          employeeNumber: true,
        },
      },
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          employeeNumber: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      updatedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          attachments: true,
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        include: {
          uploader: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
      history: {
        orderBy: { createdAt: "asc" },
        include: {
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

function historySummary(entry: {
  action: string;
  previousValues: unknown;
  newValues: unknown;
}) {
  switch (entry.action) {
    case "tickets.create":
      return "Ticket created";
    case "tickets.update":
      return "Ticket details updated";
    case "tickets.assign":
      return "Ticket assignment changed";
    case "tickets.reply":
      return "Public reply added";
    case "tickets.note":
      return "Internal note added";
    case "tickets.attach":
      return "Attachment uploaded";
    default:
      return entry.action;
  }
}

function personLabel(person: { firstName: string; lastName: string; email: string } | null | undefined) {
  if (!person) return "System";
  return `${person.firstName} ${person.lastName}`;
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAuth();
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const ticket = await loadTicket(id);

  if (!ticket) {
    notFound();
  }

  const canViewTicket = canSeeAllTickets(actor) || ticket.requesterId === actor.id || ticket.assigneeId === actor.id || ticket.createdById === actor.id;
  if (!canViewTicket) {
    redirect("/access-denied");
  }

  const categories = await prisma.ticketCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const assignees = canAssignTickets(actor)
    ? await prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeNumber: true,
        },
      })
    : [];

  const timeline = [
    ...ticket.history.map((entry) => ({
      type: "history" as const,
      id: entry.id,
      title: historySummary({
        action: entry.action,
        previousValues: entry.previousValues,
        newValues: entry.newValues,
      }),
      description: entry.actor ? `${personLabel(entry.actor)} changed the ticket` : "System event",
      createdAt: entry.createdAt,
      actor: entry.actor,
      action: entry.action,
    })),
    ...ticket.comments.map((comment) => ({
      type: "comment" as const,
      id: comment.id,
      title: comment.isInternal ? "Internal note" : "Public reply",
      description: personLabel(comment.author),
      createdAt: comment.createdAt,
      author: comment.author,
      isInternal: comment.isInternal,
      body: comment.body,
      attachments: comment.attachments,
    })),
  ].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title={ticket.referenceNumber}
        description={ticket.subject}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/tickets" className={buttonClassName({ variant: "outline" })}>
              Back to tickets
            </Link>
            {canCreateTickets(actor) ? (
              <Link href="/tickets/new" className={buttonClassName({ variant: "primary" })}>
                Open ticket
              </Link>
            ) : null}
          </div>
        }
      />

      {query.created ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Ticket created successfully.</div> : null}
      {query.updated ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Ticket details updated.</div> : null}
      {query.assigned ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Ticket assignment updated.</div> : null}
      {query.commented ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Comment added successfully.</div> : null}
      {query.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{String(query.error)}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Ticket overview</CardTitle>
                <p className="mt-1 text-sm text-slate-600">The core record, including status, priority, and the current description.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabels[ticket.status]}</Badge>
                <Badge tone={ticketPriorityTone(ticket.priority)}>{ticketPriorityLabels[ticket.priority]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Requester</p>
                  <p className="mt-2 font-semibold text-sourcehub-text">
                    {ticket.requester.firstName} {ticket.requester.lastName}
                  </p>
                  <p className="text-sm text-slate-600">{ticket.requester.email}</p>
                  <p className="text-xs text-slate-500">{ticket.requester.department ?? "No department"}</p>
                </div>
                <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Assignee</p>
                  <p className="mt-2 font-semibold text-sourcehub-text">
                    {ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : "Unassigned"}
                  </p>
                  {ticket.assignee ? <p className="text-sm text-slate-600">{ticket.assignee.email}</p> : null}
                  <p className="text-xs text-slate-500">{ticket.assignee?.department ?? "Waiting for assignment"}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
                  <p className="mt-2 font-semibold text-sourcehub-text">{ticket.category?.name ?? "Uncategorised"}</p>
                  <p className="text-xs text-slate-500">{ticket.category?.description ?? "No category description"}</p>
                </div>
                <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                  <p className="mt-2 font-semibold text-sourcehub-text">{formatDateTime(ticket.createdAt)}</p>
                  <p className="text-xs text-slate-500">By {personLabel(ticket.createdBy ?? null)}</p>
                </div>
                <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Updated</p>
                  <p className="mt-2 font-semibold text-sourcehub-text">{formatDateTime(ticket.updatedAt)}</p>
                  <p className="text-xs text-slate-500">By {personLabel(ticket.updatedBy ?? null)}</p>
                </div>
              </div>

              {canEditTickets(actor) ? (
                <form action={updateTicketAction} className="space-y-6">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-sourcehub-text" htmlFor="subject">
                        Subject
                      </label>
                      <Input id="subject" name="subject" defaultValue={ticket.subject} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">
                        Description
                      </label>
                      <Textarea id="description" name="description" defaultValue={ticket.description} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-sourcehub-text" htmlFor="status">
                        Status
                      </label>
                      <Select id="status" name="status" defaultValue={ticket.status}>
                        {ticketStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-sourcehub-text" htmlFor="priority">
                        Priority
                      </label>
                      <Select id="priority" name="priority" defaultValue={ticket.priority}>
                        {ticketPriorityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-sourcehub-text" htmlFor="categoryId">
                        Category
                      </label>
                      <Select id="categoryId" name="categoryId" defaultValue={ticket.categoryId ?? ""}>
                        <option value="">Uncategorised</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button type="submit">Save ticket</Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4 rounded-2xl border border-sourcehub-border bg-sourcehub-muted/20 p-4">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Description</p>
                    <p className="whitespace-pre-wrap text-sm text-sourcehub-text">{ticket.description}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
              <p className="mt-1 text-sm text-slate-600">Public replies are visible to the requester. Internal notes stay in the service desk.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {canCommentOnTickets(actor) ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <form action={addPublicReplyAction} encType="multipart/form-data" className="space-y-4 rounded-2xl border border-sourcehub-border bg-sourcehub-muted/20 p-4">
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <div>
                      <p className="text-sm font-semibold text-sourcehub-text">Public reply</p>
                      <p className="mt-1 text-xs text-slate-500">Visible to the requester and anyone following the ticket.</p>
                    </div>
                    <Textarea name="body" placeholder="Write a customer-facing update..." />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-sourcehub-text" htmlFor="public-attachments">
                        Attach files
                      </label>
                      <Input id="public-attachments" name="attachments" type="file" multiple className="py-2" />
                    </div>
                    <Button type="submit" variant="secondary">
                      Send reply
                    </Button>
                  </form>

                  {canSeeAllTickets(actor) ? (
                    <form action={addInternalNoteAction} encType="multipart/form-data" className="space-y-4 rounded-2xl border border-sourcehub-border bg-[#f8faff] p-4">
                      <input type="hidden" name="ticketId" value={ticket.id} />
                      <div>
                        <p className="text-sm font-semibold text-sourcehub-text">Internal note</p>
                        <p className="mt-1 text-xs text-slate-500">For technicians and service desk managers only.</p>
                      </div>
                      <Textarea name="body" placeholder="Add troubleshooting context or internal follow-up..." />
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-sourcehub-text" htmlFor="internal-attachments">
                          Attach files
                        </label>
                        <Input id="internal-attachments" name="attachments" type="file" multiple className="py-2" />
                      </div>
                      <Button type="submit">Add note</Button>
                    </form>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  title="No reply access"
                  description="You can view this ticket, but you do not have permission to add updates or notes."
                />
              )}

              <div className="space-y-4">
                {ticket.comments.length === 0 ? (
                  <EmptyState title="No replies yet" description="Use the forms above to start the conversation." />
                ) : (
                  ticket.comments.map((comment) => (
                    <div key={comment.id} className="rounded-2xl border border-sourcehub-border bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-sourcehub-text">
                            {comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : "System"}
                          </p>
                          <p className="text-xs text-slate-500">{formatDateTime(comment.createdAt)}</p>
                        </div>
                        <Badge tone={comment.isInternal ? "warning" : "info"}>{comment.isInternal ? "Internal note" : "Public reply"}</Badge>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm text-sourcehub-text">{comment.body}</p>
                      {comment.attachments.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attachments</p>
                          <div className="space-y-2">
                            {comment.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.storagePath}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between rounded-xl border border-sourcehub-border px-3 py-2 text-sm text-sourcehub-primary hover:border-sourcehub-primary"
                              >
                                <span>{attachment.originalName}</span>
                                <span className="text-xs text-slate-500">{formatFileSize(attachment.fileSize)}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ticket details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Reference</p>
                <p className="mt-1 text-lg font-bold text-sourcehub-text">{ticket.referenceNumber}</p>
              </div>
              <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                <div className="mt-2">
                  <Badge tone={ticketStatusTone(ticket.status)}>{ticketStatusLabels[ticket.status]}</Badge>
                </div>
              </div>
              <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Priority</p>
                <div className="mt-2">
                  <Badge tone={ticketPriorityTone(ticket.priority)}>{ticketPriorityLabels[ticket.priority]}</Badge>
                </div>
              </div>
              <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Requester</p>
                <div className="mt-2 flex items-start gap-3">
                  <UserCircle2 className="mt-0.5 h-5 w-5 text-sourcehub-primary" />
                  <div>
                    <p className="font-medium text-sourcehub-text">
                      {ticket.requester.firstName} {ticket.requester.lastName}
                    </p>
                    <p className="text-sm text-slate-600">{ticket.requester.email}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-sourcehub-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Time line</p>
                <div className="mt-2 space-y-2 text-sm text-sourcehub-text">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-sourcehub-primary" />
                    <span>Created {formatDateTime(ticket.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-sourcehub-primary" />
                    <span>{ticket.attachments.length.toLocaleString()} attachments</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {canAssignTickets(actor) ? (
            <Card>
              <CardHeader>
                <CardTitle>Assignment</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={assignTicketAction} className="space-y-4">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="assigneeId">
                      Assign to
                    </label>
                    <Select id="assigneeId" name="assigneeId" defaultValue={ticket.assigneeId ?? ""}>
                      <option value="">Leave unassigned</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.firstName} {assignee.lastName} - {assignee.employeeNumber}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" variant="secondary">
                    Update assignment
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.attachments.length === 0 ? (
                <EmptyState title="No attachments" description="Files uploaded to the ticket will appear here." />
              ) : (
                <div className="space-y-2">
                  {ticket.attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.storagePath}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-sourcehub-border bg-white p-3 hover:border-sourcehub-primary"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sourcehub-text">{attachment.originalName}</p>
                          <p className="text-xs text-slate-500">
                            {formatFileSize(attachment.fileSize)} - {attachment.uploader ? `${attachment.uploader.firstName} ${attachment.uploader.lastName}` : "Unknown uploader"}
                          </p>
                        </div>
                        <Paperclip className="h-4 w-4 text-sourcehub-primary" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <EmptyState title="No history" description="Ticket history will appear as the record changes." />
              ) : (
                <div className="space-y-3">
                  {timeline.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-sourcehub-border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-sourcehub-text">{entry.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{entry.description}</p>
                        </div>
                        <span className="text-xs uppercase tracking-wide text-slate-400">{formatDateTime(entry.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
