import Link from "next/link";

import { createTicketAction } from "@/lib/actions/tickets";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { canAssignTickets, canSeeAllTickets, ticketPriorityOptions } from "@/lib/tickets";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("tickets.create");
  const params = (await searchParams) ?? {};
  const categories = await prisma.ticketCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const requesters = canSeeAllTickets(actor)
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Service Desk"
        title="Open ticket"
        description="Create a new ticket with the right category, priority, and ownership from the start."
        actions={
          <Link href="/tickets" className={buttonClassName({ variant: "outline" })}>
            Back to tickets
          </Link>
        }
      />

      {params.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {String(params.error)}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Ticket details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTicketAction} encType="multipart/form-data" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="subject">
                  Subject <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="subject" name="subject" required placeholder="Printer is offline" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">
                  Description <span className="text-sourcehub-primary">*</span>
                </label>
                <Textarea id="description" name="description" required placeholder="Give as much context as possible, including when the issue started and who is affected." />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="priority">
                  Priority <span className="text-sourcehub-primary">*</span>
                </label>
                <Select id="priority" name="priority" defaultValue="NORMAL">
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
                <Select id="categoryId" name="categoryId" defaultValue="">
                  <option value="">Choose a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {canSeeAllTickets(actor) ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="requesterId">
                    Requester
                  </label>
                  <Select id="requesterId" name="requesterId" defaultValue="">
                    <option value="">Use my account</option>
                    {requesters.map((requester) => (
                      <option key={requester.id} value={requester.id}>
                        {requester.firstName} {requester.lastName} - {requester.employeeNumber}
                      </option>
                    ))}
                  </Select>
                </div>
                {canAssignTickets(actor) ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="assigneeId">
                      Assign to
                    </label>
                    <Select id="assigneeId" name="assigneeId" defaultValue="">
                      <option value="">Leave unassigned</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.firstName} {assignee.lastName} - {assignee.employeeNumber}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="attachments">
                Attachments
              </label>
              <Input id="attachments" name="attachments" type="file" multiple className="py-2" />
              <p className="text-xs text-slate-500">You can attach screenshots, PDFs, and other supporting files.</p>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit">Create ticket</Button>
              <Link href="/tickets" className={buttonClassName({ variant: "ghost" })}>
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
