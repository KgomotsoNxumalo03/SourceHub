"use server";

import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { serializeJsonValue } from "@/lib/json";
import { selectSlaPolicy, computeTicketSlaSnapshot, slaCountdownState } from "@/lib/sla";
import { saveBinaryToStorage, buildTicketStoragePath, sanitizeFilename, validateUpload } from "@/lib/storage";
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
  const name = sanitizeFilename(originalName);
  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex).toLowerCase() : "";
  return `${Date.now()}-${randomUUID().slice(0, 8)}-${base.slice(0, 50)}${extension}`;
}

async function saveTicketFiles({
  ticketId,
  workspaceId,
  referenceNumber,
  files,
  uploaderId,
  commentId,
}: {
  ticketId: string;
  workspaceId: string;
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
    workspaceId: string;
    ticketId: string;
    commentId: string | null;
    uploaderId: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    storageProvider: "firebase" | "filesystem";
    downloadUrl: string;
  }> = [];
  for (const file of files) {
    const validationError = validateUpload({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      maxBytes: 25 * 1024 * 1024,
    });

    if (validationError) {
      throw new Error(validationError);
    }

    const storageName = fileSafeName(file.name);
    const storagePath = buildTicketStoragePath(workspaceId, referenceNumber, storageName);
    const stored = await saveBinaryToStorage({
      storagePath,
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    });

    attachments.push({
      workspaceId,
      ticketId,
      commentId: commentId ?? null,
      uploaderId,
      fileName: storageName,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      storagePath: stored.storagePath,
      storageProvider: stored.provider,
      downloadUrl: stored.publicUrl,
    });
  }

  return attachments;
}

async function loadTicket(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      category: true,
      client: true,
      site: true,
      supportAgreement: true,
      slaPolicy: true,
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

async function writeSlaEvent({
  ticketId,
  policyId,
  actorId,
  type,
  payload,
}: {
  ticketId: string;
  policyId: string | null;
  actorId: string | null;
  type: string;
  payload: Record<string, unknown>;
}) {
  await prisma.slaEvent.create({
    data: {
      ticketId,
      slaPolicyId: policyId,
      actorId,
      type,
      payload: serializeJsonValue(payload),
    },
  });
}

async function recalculateTicketSla(ticket: Awaited<ReturnType<typeof loadTicket>>, actorId: string | null, reason: string) {
  const openedAt = ticket.openedAt ?? ticket.createdAt ?? new Date();
  const policy = ticket.slaPolicy
    ? ticket.slaPolicy
    : await selectSlaPolicy(
        await prisma.slaPolicy.findMany({
          where: {
            workspaceId: env.DEFAULT_WORKSPACE_ID,
            active: true,
          },
        }),
        {
          workspaceId: env.DEFAULT_WORKSPACE_ID,
          clientId: ticket.clientId ?? null,
          supportAgreementId: ticket.supportAgreementId ?? null,
          priority: ticket.priority,
          categoryId: ticket.categoryId ?? null,
        },
      );

  if (!policy) {
    return null;
  }

  const snapshot = computeTicketSlaSnapshot({
    openedAt,
    pausedMinutes: ticket.pausedMinutes ?? 0,
    firstResponseMinutes: policy.firstResponseMinutes,
    resolutionMinutes: policy.resolutionMinutes,
    policy,
  });

  const state = slaCountdownState({
    now: new Date(),
    firstResponseDueAt: snapshot.firstResponseDueAt,
    resolutionDueAt: snapshot.resolutionDueAt,
    firstResponseAt: ticket.firstResponseAt ?? null,
    resolvedAt: ticket.resolvedAt ?? null,
    pausedAt: ticket.pausedAt ?? null,
  });

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      slaPolicyId: policy.id,
      firstResponseDueAt: snapshot.firstResponseDueAt,
      resolutionDueAt: snapshot.resolutionDueAt,
      slaPausedMinutes: snapshot.pausedMinutes,
      slaState: state,
      slaLastCalculatedAt: new Date(),
      updatedById: actorId ?? ticket.updatedById ?? null,
    },
  });

  await writeSlaEvent({
    ticketId: ticket.id,
    policyId: policy.id,
    actorId,
    type: "sla.recalculated",
    payload: {
      reason,
      firstResponseDueAt: snapshot.firstResponseDueAt,
      resolutionDueAt: snapshot.resolutionDueAt,
      state,
    },
  });

  return { policy, snapshot, state };
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
          workspaceId: env.DEFAULT_WORKSPACE_ID,
          referenceNumber: ticket.referenceNumber,
          files,
          uploaderId: actor.id,
          commentId: comment.id,
        })
      : [];

  if (attachmentRecords.length > 0) {
    await prisma.ticketAttachment.createMany({ data: attachmentRecords });
  }

  const now = new Date();
  const ticketUpdates: Record<string, unknown> = {
    updatedById: actor.id,
  };

  if (visibility === "public" && actor.id !== ticket.requesterId && !ticket.firstResponseAt) {
    ticketUpdates.firstResponseAt = now;
  }

  if (visibility === "public" && ticket.status === "WAITING_FOR_CUSTOMER") {
    const pausedSince = ticket.pausedAt ?? now;
    ticketUpdates.slaPausedMinutes = (ticket.slaPausedMinutes ?? 0) + Math.max(0, Math.floor((now.getTime() - pausedSince.getTime()) / 60_000));
    ticketUpdates.pausedAt = null;
    ticketUpdates.slaState = "HEALTHY";
    if (actor.id === ticket.requesterId) {
      ticketUpdates.lastClientReplyAt = now;
    }
  } else if (visibility === "public" && actor.id === ticket.requesterId) {
    ticketUpdates.lastClientReplyAt = now;
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: ticketUpdates,
  });

  if (visibility === "public" && actor.id !== ticket.requesterId && !ticket.firstResponseAt) {
    await writeSlaEvent({
      ticketId,
      policyId: ticket.slaPolicyId ?? null,
      actorId: actor.id,
      type: "sla.first_response_recorded",
      payload: {
        recordedAt: now,
      },
    });
  }

  if (visibility === "public" && ticket.status === "WAITING_FOR_CUSTOMER") {
    await writeSlaEvent({
      ticketId,
      policyId: ticket.slaPolicyId ?? null,
      actorId: actor.id,
      type: "sla.resumed",
      payload: {
        pausedMinutes: ticketUpdates.slaPausedMinutes,
        resumedAt: now,
      },
    });
  }

  await recalculateTicketSla(
    {
      ...ticket,
      ...ticketUpdates,
      status: ticket.status,
      pausedAt: (ticketUpdates.pausedAt as Date | null | undefined) ?? ticket.pausedAt ?? null,
      slaPausedMinutes: (ticketUpdates.slaPausedMinutes as number | undefined) ?? ticket.slaPausedMinutes ?? 0,
    },
    actor.id,
    visibility === "internal" ? "ticket.note" : "ticket.reply",
  );

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
    assetId: formData.get("assetId"),
    clientId: formData.get("clientId"),
    siteId: formData.get("siteId"),
    supportAgreementId: formData.get("supportAgreementId"),
    priority: formData.get("priority"),
    requesterId: formData.get("requesterId"),
    assigneeId: formData.get("assigneeId"),
  });

  if (!payload.success) {
    errorRedirect("/tickets/new", payload.error.issues[0]?.message ?? "Please review the ticket form.");
  }

  const data = payload.data!;
  const attachments = formData.getAll("attachments").filter((value): value is File => isFile(value));
  const openedAt = new Date();
  const selectedAsset = data.assetId
    ? await prisma.asset.findUnique({
        where: { id: data.assetId },
        select: {
          id: true,
          workspaceId: true,
          clientId: true,
          siteId: true,
          assignedUserId: true,
          responsibleTechnicianId: true,
          status: true,
        },
      })
    : null;

  if (attachments.length > 0 && !canAttachToTickets(actor)) {
    redirect("/access-denied");
  }

  if (data.assetId && (!selectedAsset || selectedAsset.workspaceId !== env.DEFAULT_WORKSPACE_ID || ["ARCHIVED", "DISPOSED"].includes(selectedAsset.status))) {
    errorRedirect("/tickets/new", "Selected asset does not exist.");
  }

  const requesterId = canSeeAllTickets(actor)
    ? await resolveRequestUser(data.requesterId || selectedAsset?.assignedUserId || "", actor.id)
    : actor.id;

  const assigneeId = canSeeAllTickets(actor) && canEditTickets(actor)
    ? await resolveAssignableUser(data.assigneeId || selectedAsset?.responsibleTechnicianId || null)
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

  const [client, site, supportAgreement] = await Promise.all([
    (data.clientId || selectedAsset?.clientId)
      ? prisma.client.findUnique({
          where: { id: data.clientId || selectedAsset?.clientId || "" },
          select: { id: true, workspaceId: true, status: true },
        })
      : Promise.resolve(null),
    (data.siteId || selectedAsset?.siteId)
      ? prisma.clientSite.findUnique({
          where: { id: data.siteId || selectedAsset?.siteId || "" },
          select: { id: true, clientId: true, workspaceId: true },
        })
      : Promise.resolve(null),
    data.supportAgreementId
      ? prisma.supportAgreement.findUnique({
          where: { id: data.supportAgreementId },
          select: { id: true, clientId: true, workspaceId: true },
        })
      : Promise.resolve(null),
  ]);

  if ((data.clientId || selectedAsset?.clientId) && (!client || client.workspaceId !== env.DEFAULT_WORKSPACE_ID || client.status === "FORMER")) {
    errorRedirect("/tickets/new", "Selected client does not exist.");
  }

  if ((data.siteId || selectedAsset?.siteId) && (!site || site.clientId !== client?.id || site.workspaceId !== env.DEFAULT_WORKSPACE_ID)) {
    errorRedirect("/tickets/new", "Selected site does not belong to that client.");
  }

  if (
    data.supportAgreementId &&
    (!supportAgreement || supportAgreement.clientId !== client?.id || supportAgreement.workspaceId !== env.DEFAULT_WORKSPACE_ID)
  ) {
    errorRedirect("/tickets/new", "Selected support agreement does not belong to that client.");
  }

  const slaPolicy =
    (
      await selectSlaPolicy(
        await prisma.slaPolicy.findMany({
          where: {
            workspaceId: env.DEFAULT_WORKSPACE_ID,
            active: true,
          },
        }),
        {
          workspaceId: env.DEFAULT_WORKSPACE_ID,
          clientId: client?.id ?? null,
          supportAgreementId: supportAgreement?.id ?? null,
          priority: data.priority,
          categoryId: category?.id ?? null,
        },
      )
    ) ?? null;

  const slaSnapshot = slaPolicy
    ? computeTicketSlaSnapshot({
        openedAt,
        firstResponseMinutes: slaPolicy.firstResponseMinutes,
        resolutionMinutes: slaPolicy.resolutionMinutes,
        policy: slaPolicy,
      })
    : null;

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
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        referenceNumber,
        subject: data.subject,
        description: data.description,
        status: "NEW",
        priority: data.priority,
        categoryId: category?.id ?? null,
        assetId: selectedAsset?.id ?? null,
        clientId: client?.id ?? selectedAsset?.clientId ?? null,
        siteId: site?.id ?? selectedAsset?.siteId ?? null,
        supportAgreementId: supportAgreement?.id ?? null,
        slaPolicyId: slaPolicy?.id ?? null,
        firstResponseDueAt: slaSnapshot?.firstResponseDueAt ?? null,
        resolutionDueAt: slaSnapshot?.resolutionDueAt ?? null,
        firstResponseAt: null,
        resolvedAt: null,
        closedAt: null,
        pausedAt: null,
        slaPausedMinutes: 0,
        slaState: slaPolicy ? "HEALTHY" : null,
        slaLastCalculatedAt: slaPolicy ? openedAt : null,
        openedAt,
        lastClientReplyAt: null,
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
              assetId: selectedAsset?.id ?? null,
              clientId: client?.id ?? selectedAsset?.clientId ?? null,
              siteId: site?.id ?? selectedAsset?.siteId ?? null,
              supportAgreementId: supportAgreement?.id ?? null,
              slaPolicyId: slaPolicy?.id ?? null,
              firstResponseDueAt: slaSnapshot?.firstResponseDueAt ?? null,
              resolutionDueAt: slaSnapshot?.resolutionDueAt ?? null,
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
          workspaceId: env.DEFAULT_WORKSPACE_ID,
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

  if (slaPolicy) {
    await prisma.slaEvent.create({
      data: {
        ticketId: ticket.id,
        slaPolicyId: slaPolicy.id,
        actorId: actor.id,
        type: "sla.policy_applied",
        payload: serializeJsonValue({
          firstResponseDueAt: slaSnapshot?.firstResponseDueAt ?? null,
          resolutionDueAt: slaSnapshot?.resolutionDueAt ?? null,
          priority: data.priority,
          clientId: client?.id ?? null,
          supportAgreementId: supportAgreement?.id ?? null,
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
    assetId: formData.get("assetId"),
    priority: formData.get("priority"),
    status: formData.get("status"),
  });

  if (!payload.success) {
    errorRedirect(`/tickets/${ticketId}`, payload.error.issues[0]?.message ?? "Please review the ticket details.");
  }

  const data = payload.data!;
  const selectedAsset = data.assetId
    ? await prisma.asset.findUnique({
        where: { id: data.assetId },
        select: {
          id: true,
          workspaceId: true,
          clientId: true,
          siteId: true,
          status: true,
        },
      })
    : null;
  const category = data.categoryId
    ? await prisma.ticketCategory.findUnique({
        where: { id: data.categoryId },
        select: { id: true },
      })
    : null;

  if (data.categoryId && !category) {
    errorRedirect(`/tickets/${ticketId}`, "Selected category does not exist.");
  }

  if (data.assetId && (!selectedAsset || selectedAsset.workspaceId !== env.DEFAULT_WORKSPACE_ID || ["ARCHIVED", "DISPOSED"].includes(selectedAsset.status))) {
    errorRedirect(`/tickets/${ticketId}`, "Selected asset does not exist.");
  }

  const [client, site, supportAgreement] = await Promise.all([
    (data.clientId || selectedAsset?.clientId)
      ? prisma.client.findUnique({
          where: { id: data.clientId || selectedAsset?.clientId || "" },
          select: { id: true, workspaceId: true, status: true },
        })
      : Promise.resolve(null),
    (data.siteId || selectedAsset?.siteId)
      ? prisma.clientSite.findUnique({
          where: { id: data.siteId || selectedAsset?.siteId || "" },
          select: { id: true, clientId: true, workspaceId: true },
        })
      : Promise.resolve(null),
    data.supportAgreementId
      ? prisma.supportAgreement.findUnique({
          where: { id: data.supportAgreementId },
          select: { id: true, clientId: true, workspaceId: true },
        })
      : Promise.resolve(null),
  ]);

  if ((data.clientId || selectedAsset?.clientId) && (!client || client.workspaceId !== env.DEFAULT_WORKSPACE_ID || client.status === "FORMER")) {
    errorRedirect(`/tickets/${ticketId}`, "Selected client does not exist.");
  }

  if ((data.siteId || selectedAsset?.siteId) && (!site || site.clientId !== client?.id || site.workspaceId !== env.DEFAULT_WORKSPACE_ID)) {
    errorRedirect(`/tickets/${ticketId}`, "Selected site does not belong to that client.");
  }

  if (
    data.supportAgreementId &&
    (!supportAgreement || supportAgreement.clientId !== client?.id || supportAgreement.workspaceId !== env.DEFAULT_WORKSPACE_ID)
  ) {
    errorRedirect(`/tickets/${ticketId}`, "Selected support agreement does not belong to that client.");
  }

  const now = new Date();
  let pausedAt = ticket.pausedAt ?? null;
  let slaPausedMinutes = ticket.slaPausedMinutes ?? 0;

  if (ticket.status !== "WAITING_FOR_CUSTOMER" && data.status === "WAITING_FOR_CUSTOMER" && !pausedAt) {
    pausedAt = now;
  }

  if (ticket.status === "WAITING_FOR_CUSTOMER" && data.status !== "WAITING_FOR_CUSTOMER" && pausedAt) {
    slaPausedMinutes += Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 60_000));
    pausedAt = null;
  }

  const resolvedAt = data.status === "RESOLVED" ? ticket.resolvedAt ?? now : ticket.resolvedAt;
  const closedAt = data.status === "CLOSED" ? ticket.closedAt ?? now : ticket.closedAt;
  const updateData = {
    subject: data.subject,
    description: data.description,
    categoryId: category?.id ?? null,
    assetId: selectedAsset?.id ?? null,
    clientId: client?.id ?? selectedAsset?.clientId ?? null,
    siteId: site?.id ?? selectedAsset?.siteId ?? null,
    supportAgreementId: supportAgreement?.id ?? null,
    priority: data.priority,
    status: data.status,
    resolvedAt,
    closedAt,
    pausedAt,
    slaPausedMinutes,
    updatedById: actor.id,
  };

  await prisma.ticket.update({
    where: { id: ticketId },
    data: updateData,
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
        assetId: ticket.assetId ?? null,
        clientId: ticket.clientId ?? null,
        siteId: ticket.siteId ?? null,
        supportAgreementId: ticket.supportAgreementId ?? null,
        priority: ticket.priority,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
        pausedAt: ticket.pausedAt ?? null,
        slaPausedMinutes: ticket.slaPausedMinutes ?? 0,
      }),
      newValues: serializeJsonValue(updateData),
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
      assetId: ticket.assetId ?? null,
      clientId: ticket.clientId ?? null,
      siteId: ticket.siteId ?? null,
      supportAgreementId: ticket.supportAgreementId ?? null,
      priority: ticket.priority,
      status: ticket.status,
    },
    newValues: updateData,
    ipAddress: getIpAddress(),
  });

  await recalculateTicketSla(
    {
      ...ticket,
      ...updateData,
      status: data.status,
      resolvedAt,
      closedAt,
      pausedAt,
      slaPausedMinutes,
    },
    actor.id,
    "ticket.update",
  );

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
