"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeJsonValue } from "@/lib/json";
import {
  canAccessTicketRecord,
  canAttachToTickets,
  canAssignTickets,
  canCommentOnTickets,
  canCreateTickets,
  canEditTickets,
  canSeeAllTickets,
} from "@/lib/tickets";
import {
  ticketAssignmentSchema,
  ticketCommentSchema,
  ticketCreateSchema,
  ticketUpdateSchema,
} from "@/lib/validators";

function errorRedirect(pathname: string, message: string) {
  redirect(`${pathname}?error=${encodeURIComponent(message)}`);
}

function getIpAddress() {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers().get("x-real-ip") ?? null;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

function fileSafeName(originalName: string) {
  const parsed = path.parse(originalName);
  const base = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "attachment";
  const extension = parsed.ext?.toLowerCase() ?? "";
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${base}${extension}`;
}

async function saveTicketFiles({
  ticketId,
  referenceNumber,
  files,
  uploaderId,
  commentId,
}: {
  ticketId: string;
  referenceNumber: string;
  files: File[];
  uploaderId: string;
  commentId?: string | null;
}) {
  if (files.length === 0) {
    return [];
  }

  const storageDir = path.join(process.cwd(), "public", "uploads", "tickets", referenceNumber);
  await mkdir(storageDir, { recursive: true });

  const attachments: Array<{
    ticketId: string;
    commentId: string | null;
    uploaderId: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
  }> = [];
  for (const file of files) {
    const storageName = fileSafeName(file.name);
    const storagePath = path.join(storageDir, storageName);
    await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));

    attachments.push({
      ticketId,
      commentId: commentId ?? null,
      uploaderId,
      fileName: storageName,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      storagePath: `/uploads/tickets/${referenceNumber}/${storageName}`,
    });
  }

  return attachments;
}

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
        },
      },
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
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
          comment: {
            select: {
              id: true,
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

async function validateTicketAccess(ticketId: string) {
  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    errorRedirect("/tickets", "The selected ticket no longer exists.");
  }

  return ticket!;
}

async function resolveRequestUser(requesterId: string, fallbackUserId: string) {
  if (!requesterId) {
    return fallbackUserId;
  }

  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { id: true },
  });

  return requester?.id ?? fallbackUserId;
}

async function resolveAssignableUser(assigneeId: string | null | undefined) {
  if (!assigneeId) {
    return null;
  }

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, status: true },
  });

  if (!assignee || assignee.status !== "ACTIVE") {
    return null;
  }

  return assignee.id;
}

async function commentOnTicketAction(formData: FormData, visibility: "public" | "internal") {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!canCommentOnTickets(actor)) {
    redirect("/access-denied");
  }

  const ticketId = String(formData.get("ticketId") ?? "");
  if (!ticketId) {
    errorRedirect("/tickets", "Missing ticket identifier.");
  }

  const ticket = await validateTicketAccess(ticketId);
  const isOwnTicket = ticket.requesterId === actor.id || ticket.assigneeId === actor.id || ticket.createdById === actor.id;

  if (!canAccessTicketRecord(actor, ticket) || (visibility === "internal" && !canSeeAllTickets(actor))) {
    redirect("/access-denied");
  }

  if (visibility === "public" && !isOwnTicket && !canSeeAllTickets(actor)) {
    redirect("/access-denied");
  }

  const payload = ticketCommentSchema.safeParse({
    body: formData.get("body"),
    visibility,
  });

  if (!payload.success) {
    errorRedirect(`/tickets/${ticketId}`, payload.error.issues[0]?.message ?? "Please enter a comment.");
  }

  const data = payload.data!;
  const files = formData.getAll("attachments").filter((value): value is File => isFile(value));

  if (!data.body && files.length === 0) {
    errorRedirect(`/tickets/${ticketId}`, "Add a reply or attach a file.");
  }

  if (files.length > 0 && !canAttachToTickets(actor)) {
    redirect("/access-denied");
  }

  const comment = await prisma.ticketComment.create({
    data: {
      ticketId,
      authorId: actor.id,
      body: data.body,
      isInternal: visibility === "internal",
    },
  });

  const attachmentRecords =
    files.length > 0
      ? await saveTicketFiles({
          ticketId,
          referenceNumber: ticket.referenceNumber,
          files,
          uploaderId: actor.id,
          commentId: comment.id,
        })
      : [];

  if (attachmentRecords.length > 0) {
    await prisma.ticketAttachment.createMany({ data: attachmentRecords });
  }

  await prisma.ticketHistory.create({
    data: {
      ticketId,
      actorId: actor.id,
      action: visibility === "internal" ? "tickets.note" : "tickets.reply",
      newValues: serializeJsonValue({
        commentId: comment.id,
        visibility,
        attachmentCount: attachmentRecords.length,
      }),
    },
  });

  await logAudit({
    userId: actor.id,
    action: visibility === "internal" ? "tickets.note" : "tickets.reply",
    entityType: "Ticket",
    entityId: ticketId,
    newValues: {
      commentId: comment.id,
      visibility,
      attachmentCount: attachmentRecords.length,
    },
    ipAddress: getIpAddress(),
  });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  redirect(`/tickets/${ticketId}?commented=1`);
}

export async function createTicketAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!canCreateTickets(actor)) {
    redirect("/access-denied");
  }

  const payload = ticketCreateSchema.safeParse({
    subject: formData.get("subject"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    priority: formData.get("priority"),
    requesterId: formData.get("requesterId"),
    assigneeId: formData.get("assigneeId"),
  });

  if (!payload.success) {
    errorRedirect("/tickets/new", payload.error.issues[0]?.message ?? "Please review the ticket form.");
  }

  const data = payload.data!;
  const attachments = formData.getAll("attachments").filter((value): value is File => isFile(value));

  if (attachments.length > 0 && !canAttachToTickets(actor)) {
    redirect("/access-denied");
  }

  const requesterId = canSeeAllTickets(actor)
    ? await resolveRequestUser(data.requesterId || "", actor.id)
    : actor.id;

  const assigneeId = canSeeAllTickets(actor) && canEditTickets(actor)
    ? await resolveAssignableUser(data.assigneeId || null)
    : null;

  const category = data.categoryId
    ? await prisma.ticketCategory.findUnique({
        where: { id: data.categoryId },
        select: { id: true, name: true },
      })
    : null;

  if (data.categoryId && !category) {
    errorRedirect("/tickets/new", "Selected category does not exist.");
  }

  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { id: true },
  });

  if (!requester) {
    errorRedirect("/tickets/new", "Selected requester does not exist.");
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const sequence = await tx.ticketSequence.upsert({
      where: { name: "default" },
      create: { name: "default", currentValue: 1 },
      update: { currentValue: { increment: 1 } },
    });

    const referenceNumber = `SH-TKT-${String(sequence.currentValue).padStart(6, "0")}`;

    const created = await tx.ticket.create({
      data: {
        referenceNumber,
        subject: data.subject,
        description: data.description,
        status: "NEW",
        priority: data.priority,
        categoryId: category?.id ?? null,
        requesterId,
        assigneeId,
        createdById: actor.id,
        updatedById: actor.id,
        history: {
          create: {
            actorId: actor.id,
            action: "tickets.create",
            newValues: serializeJsonValue({
              referenceNumber,
              subject: data.subject,
              categoryId: category?.id ?? null,
              categoryName: category?.name ?? null,
              priority: data.priority,
              requesterId,
              assigneeId,
              attachmentCount: attachments.length,
            }),
          },
        },
      },
    });

    return created;
  });

  const savedAttachments =
    attachments.length > 0
      ? await saveTicketFiles({
          ticketId: ticket.id,
          referenceNumber: ticket.referenceNumber,
          files: attachments,
          uploaderId: actor.id,
        })
      : [];

  if (savedAttachments.length > 0) {
    await prisma.ticketAttachment.createMany({ data: savedAttachments });
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: actor.id,
        action: "tickets.attach",
        newValues: serializeJsonValue({
          attachmentCount: savedAttachments.length,
        }),
      },
    });
  }

  await logAudit({
    userId: actor.id,
    action: "tickets.create",
    entityType: "Ticket",
    entityId: ticket.id,
    newValues: {
      referenceNumber: ticket.referenceNumber,
      subject: ticket.subject,
      priority: ticket.priority,
      status: ticket.status,
      categoryId: ticket.categoryId,
      requesterId: ticket.requesterId,
      assigneeId: ticket.assigneeId,
      attachmentCount: savedAttachments.length,
    },
    ipAddress: getIpAddress(),
  });

  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticket.id}?created=1`);
}

export async function updateTicketAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!canEditTickets(actor)) {
    redirect("/access-denied");
  }

  const ticketId = String(formData.get("ticketId") ?? "");
  if (!ticketId) {
    errorRedirect("/tickets", "Missing ticket identifier.");
  }

  const ticket = await validateTicketAccess(ticketId);
  const payload = ticketUpdateSchema.safeParse({
    subject: formData.get("subject"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    priority: formData.get("priority"),
    status: formData.get("status"),
  });

  if (!payload.success) {
    errorRedirect(`/tickets/${ticketId}`, payload.error.issues[0]?.message ?? "Please review the ticket details.");
  }

  const data = payload.data!;
  const category = data.categoryId
    ? await prisma.ticketCategory.findUnique({
        where: { id: data.categoryId },
        select: { id: true },
      })
    : null;

  if (data.categoryId && !category) {
    errorRedirect(`/tickets/${ticketId}`, "Selected category does not exist.");
  }

  const resolvedAt = data.status === "RESOLVED" && !ticket.resolvedAt ? new Date() : data.status === "RESOLVED" ? ticket.resolvedAt : null;
  const closedAt = data.status === "CLOSED" && !ticket.closedAt ? new Date() : data.status === "CLOSED" ? ticket.closedAt : null;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      subject: data.subject,
      description: data.description,
      categoryId: category?.id ?? null,
      priority: data.priority,
      status: data.status,
      resolvedAt,
      closedAt,
      updatedById: actor.id,
    },
  });

  await prisma.ticketHistory.create({
    data: {
      ticketId,
      actorId: actor.id,
      action: "tickets.update",
      previousValues: serializeJsonValue({
        subject: ticket.subject,
        description: ticket.description,
        categoryId: ticket.categoryId,
        priority: ticket.priority,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
      }),
      newValues: serializeJsonValue({
        subject: data.subject,
        description: data.description,
        categoryId: category?.id ?? null,
        priority: data.priority,
        status: data.status,
        resolvedAt,
        closedAt,
      }),
    },
  });

  await logAudit({
    userId: actor.id,
    action: "tickets.update",
    entityType: "Ticket",
    entityId: ticketId,
    previousValues: {
      subject: ticket.subject,
      description: ticket.description,
      categoryId: ticket.categoryId,
      priority: ticket.priority,
      status: ticket.status,
    },
    newValues: {
      subject: data.subject,
      description: data.description,
      categoryId: category?.id ?? null,
      priority: data.priority,
      status: data.status,
    },
    ipAddress: getIpAddress(),
  });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  redirect(`/tickets/${ticketId}?updated=1`);
}

export async function assignTicketAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!canAssignTickets(actor)) {
    redirect("/access-denied");
  }

  const ticketId = String(formData.get("ticketId") ?? "");
  if (!ticketId) {
    errorRedirect("/tickets", "Missing ticket identifier.");
  }

  const ticket = await validateTicketAccess(ticketId);
  const payload = ticketAssignmentSchema.safeParse({
    assigneeId: formData.get("assigneeId"),
  });

  if (!payload.success) {
    errorRedirect(`/tickets/${ticketId}`, payload.error.issues[0]?.message ?? "Please choose an assignee.");
  }

  const assigneeId = await resolveAssignableUser(payload.data!.assigneeId || null);

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assigneeId,
      updatedById: actor.id,
    },
  });

  await prisma.ticketHistory.create({
    data: {
      ticketId,
      actorId: actor.id,
      action: "tickets.assign",
      previousValues: serializeJsonValue({
        assigneeId: ticket.assigneeId,
      }),
      newValues: serializeJsonValue({
        assigneeId,
      }),
    },
  });

  await logAudit({
    userId: actor.id,
    action: "tickets.assign",
    entityType: "Ticket",
    entityId: ticketId,
    previousValues: {
      assigneeId: ticket.assigneeId,
    },
    newValues: {
      assigneeId,
    },
    ipAddress: getIpAddress(),
  });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  redirect(`/tickets/${ticketId}?assigned=1`);
}

export async function addPublicReplyAction(formData: FormData) {
  return commentOnTicketAction(formData, "public");
}

export async function addInternalNoteAction(formData: FormData) {
  return commentOnTicketAction(formData, "internal");
}
