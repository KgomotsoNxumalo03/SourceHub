"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { calculateContractStatus } from "@/lib/crm";
import { normalizeEmailAddress } from "@/lib/email";
import { buildClientStoragePath, sanitizeFilename, saveBinaryToStorage, validateUpload } from "@/lib/storage";
import {
  billingProfileFormSchema,
  clientContactFormSchema,
  clientFormSchema,
  clientNoteFormSchema,
  clientSiteFormSchema,
  contractFormSchema,
  portalInvitationFormSchema,
  supportAgreementFormSchema,
} from "@/lib/validators";

function errorRedirect(pathname: string, message: string) {
  redirect(`${pathname}?error=${encodeURIComponent(message)}`);
}

function getIpAddress() {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers().get("x-real-ip") ?? null;
}

async function ensureCrmAccess(permission: string) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes(permission)) redirect("/access-denied");
  return actor;
}

async function clientExists(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, workspaceId: true, status: true },
  });
  if (!client || client.workspaceId !== env.DEFAULT_WORKSPACE_ID) return null;
  return client;
}

export async function createClientAction(formData: FormData) {
  const actor = await ensureCrmAccess("clients.create");
  const payload = clientFormSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    code: formData.get("code"),
    status: formData.get("status"),
    workspaceId: formData.get("workspaceId"),
    website: formData.get("website"),
    supportEmail: formData.get("supportEmail"),
    phone: formData.get("phone"),
    industry: formData.get("industry"),
    accountManagerId: formData.get("accountManagerId"),
  });

  if (!payload.success) {
    errorRedirect("/clients/new", payload.error.issues[0]?.message ?? "Please review the client form.");
  }

  const data = payload.data!;
  const existing = await prisma.client.findFirst({
    where: {
      workspaceId: data.workspaceId,
      OR: [{ code: data.code }, { name: data.name }],
    },
  });

  if (existing) {
    errorRedirect("/clients/new", "A client with that name or code already exists.");
  }

  const client = await prisma.client.create({
    data: {
      workspaceId: data.workspaceId,
      name: data.name,
      legalName: data.legalName || null,
      code: data.code,
      status: data.status,
      website: data.website || null,
      supportEmail: data.supportEmail || null,
      phone: data.phone || null,
      industry: data.industry || null,
      accountManagerId: data.accountManagerId || null,
      archivedAt: null,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes) {
    await prisma.clientNote.create({
      data: {
        workspaceId: data.workspaceId,
        clientId: client.id,
        body: notes,
        visibility: "internal",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
  }

  await logAudit({
    userId: actor.id,
    action: "clients.create",
    entityType: "Client",
    entityId: client.id,
    newValues: client,
    ipAddress: getIpAddress(),
  });

  revalidatePath("/clients");
  redirect(`/clients/${client.id}?created=1`);
}

export async function updateClientAction(formData: FormData) {
  const actor = await ensureCrmAccess("clients.update");
  const clientId = String(formData.get("id") ?? "");
  if (!clientId) errorRedirect("/clients", "Missing client identifier.");

  const existing = await clientExists(clientId);
  if (!existing) errorRedirect("/clients", "The selected client no longer exists.");

  const payload = clientFormSchema.safeParse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    code: formData.get("code"),
    status: formData.get("status"),
    workspaceId: existing.workspaceId,
    website: formData.get("website"),
    supportEmail: formData.get("supportEmail"),
    phone: formData.get("phone"),
    industry: formData.get("industry"),
    accountManagerId: formData.get("accountManagerId"),
  });

  if (!payload.success) {
    errorRedirect(`/clients/${clientId}`, payload.error.issues[0]?.message ?? "Please review the client form.");
  }

  const data = payload.data!;
  const duplicate = await prisma.client.findFirst({
    where: {
      workspaceId: existing.workspaceId,
      NOT: { id: clientId },
      OR: [{ code: data.code }, { name: data.name }],
    },
  });

  if (duplicate) {
    errorRedirect(`/clients/${clientId}`, "Another client already uses that code or name.");
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: {
      name: data.name,
      legalName: data.legalName || null,
      code: data.code,
      status: data.status,
      website: data.website || null,
      supportEmail: data.supportEmail || null,
      phone: data.phone || null,
      industry: data.industry || null,
      accountManagerId: data.accountManagerId || null,
      archivedAt: data.status === "FORMER" ? existing.archivedAt ?? new Date() : null,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.update",
    entityType: "Client",
    entityId: clientId,
    previousValues: existing,
    newValues: updated,
    ipAddress: getIpAddress(),
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?updated=1`);
}

export async function archiveClientAction(formData: FormData) {
  const actor = await ensureCrmAccess("clients.archive");
  const clientId = String(formData.get("id") ?? "");
  if (!clientId) errorRedirect("/clients", "Missing client identifier.");

  const existing = await clientExists(clientId);
  if (!existing) errorRedirect("/clients", "The selected client no longer exists.");

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      status: "FORMER",
      archivedAt: new Date(),
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.archive",
    entityType: "Client",
    entityId: clientId,
    previousValues: existing,
    newValues: client,
    ipAddress: getIpAddress(),
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?archived=1`);
}

export async function restoreClientAction(formData: FormData) {
  const actor = await ensureCrmAccess("clients.archive");
  const clientId = String(formData.get("id") ?? "");
  if (!clientId) errorRedirect("/clients", "Missing client identifier.");

  const existing = await clientExists(clientId);
  if (!existing) errorRedirect("/clients", "The selected client no longer exists.");

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      status: "ACTIVE",
      archivedAt: null,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.restore",
    entityType: "Client",
    entityId: clientId,
    previousValues: existing,
    newValues: client,
    ipAddress: getIpAddress(),
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?restored=1`);
}

export async function createContactAction(formData: FormData) {
  const actor = await ensureCrmAccess("contacts.manage");
  const payload = clientContactFormSchema.safeParse({
    clientId: formData.get("clientId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    title: formData.get("title"),
    isPrimary: formData.get("isPrimary"),
    portalAccess: formData.get("portalAccess"),
  });

  if (!payload.success) errorRedirect(`/clients/${String(formData.get("clientId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the contact form.");

  const data = payload.data!;
  const client = await clientExists(data.clientId);
  if (!client) errorRedirect("/clients", "Selected client does not exist.");

  const duplicate = await prisma.clientContact.findFirst({
    where: { workspaceId: client.workspaceId, email: normalizeEmailAddress(String(data.email)) },
  });
  if (duplicate) errorRedirect(`/clients/${data.clientId}`, "A contact with that email already exists.");

  const contact = await prisma.clientContact.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: normalizeEmailAddress(data.email),
      phone: data.phone || null,
      title: data.title || null,
      isPrimary: data.isPrimary,
      portalAccess: data.portalAccess,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.contact.create",
    entityType: "ClientContact",
    entityId: contact.id,
    newValues: contact,
    ipAddress: getIpAddress(),
  });

  revalidatePath(`/clients/${client.id}`);
  redirect(`/clients/${client.id}?contactCreated=1`);
}

export async function createSiteAction(formData: FormData) {
  const actor = await ensureCrmAccess("sites.manage");
  const payload = clientSiteFormSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    code: formData.get("code"),
    city: formData.get("city"),
    province: formData.get("province"),
    country: formData.get("country"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2"),
    postalCode: formData.get("postalCode"),
    isPrimary: formData.get("isPrimary"),
  });

  if (!payload.success) errorRedirect(`/clients/${String(formData.get("clientId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the site form.");

  const data = payload.data!;
  const client = await clientExists(data.clientId);
  if (!client) errorRedirect("/clients", "Selected client does not exist.");

  const duplicate = await prisma.clientSite.findFirst({
    where: { workspaceId: client.workspaceId, clientId: client.id, OR: [{ code: data.code }, { name: data.name }] },
  });
  if (duplicate) errorRedirect(`/clients/${client.id}`, "A site with that name or code already exists.");

  const site = await prisma.clientSite.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      name: data.name,
      code: data.code,
      city: data.city || null,
      province: data.province || null,
      country: data.country || null,
      addressLine1: data.addressLine1 || null,
      addressLine2: data.addressLine2 || null,
      postalCode: data.postalCode || null,
      isPrimary: data.isPrimary,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.site.create",
    entityType: "ClientSite",
    entityId: site.id,
    newValues: site,
    ipAddress: getIpAddress(),
  });

  revalidatePath(`/clients/${client.id}`);
  redirect(`/clients/${client.id}?siteCreated=1`);
}

export async function createContractAction(formData: FormData) {
  const actor = await ensureCrmAccess("contracts.manage");
  const payload = contractFormSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    status: formData.get("status"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    autoRenew: formData.get("autoRenew"),
    value: formData.get("value"),
  });

  if (!payload.success) errorRedirect(`/clients/${String(formData.get("clientId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the contract form.");

  const data = payload.data!;
  const client = await clientExists(data.clientId);
  if (!client) errorRedirect("/clients", "Selected client does not exist.");

  const contract = await prisma.contract.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      name: data.name,
      status: calculateContractStatus({
        id: randomUUID(),
        workspaceId: client.workspaceId,
        clientId: client.id,
        status: data.status,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        autoRenew: data.autoRenew,
      }),
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      autoRenew: data.autoRenew,
      value: data.value || null,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.contract.create",
    entityType: "Contract",
    entityId: contract.id,
    newValues: contract,
    ipAddress: getIpAddress(),
  });

  revalidatePath(`/clients/${client.id}`);
  redirect(`/clients/${client.id}?contractCreated=1`);
}

export async function createSupportAgreementAction(formData: FormData) {
  const actor = await ensureCrmAccess("support_agreements.manage");
  const payload = supportAgreementFormSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    active: formData.get("active"),
    priority: formData.get("priority"),
    categoryId: formData.get("categoryId"),
    siteId: formData.get("siteId"),
    supportWindow: formData.get("supportWindow"),
  });

  if (!payload.success) errorRedirect(`/clients/${String(formData.get("clientId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the support agreement form.");

  const data = payload.data!;
  const client = await clientExists(data.clientId);
  if (!client) errorRedirect("/clients", "Selected client does not exist.");

  const agreement = await prisma.supportAgreement.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      name: data.name,
      active: data.active,
      priority: data.priority || null,
      categoryId: data.categoryId || null,
      siteId: data.siteId || null,
      supportWindow: data.supportWindow || null,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.supportAgreement.create",
    entityType: "SupportAgreement",
    entityId: agreement.id,
    newValues: agreement,
    ipAddress: getIpAddress(),
  });

  revalidatePath(`/clients/${client.id}`);
  redirect(`/clients/${client.id}?agreementCreated=1`);
}

export async function createBillingProfileAction(formData: FormData) {
  const actor = await ensureCrmAccess("billing.manage");
  const payload = billingProfileFormSchema.safeParse({
    clientId: formData.get("clientId"),
    legalName: formData.get("legalName"),
    taxNumber: formData.get("taxNumber"),
    invoiceEmail: formData.get("invoiceEmail"),
    billingCycle: formData.get("billingCycle"),
    creditTerms: formData.get("creditTerms"),
  });

  if (!payload.success) errorRedirect(`/clients/${String(formData.get("clientId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the billing form.");

  const data = payload.data!;
  const client = await clientExists(data.clientId);
  if (!client) errorRedirect("/clients", "Selected client does not exist.");

  const profile = await prisma.billingProfile.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      legalName: data.legalName,
      taxNumber: data.taxNumber || null,
      invoiceEmail: data.invoiceEmail || null,
      billingCycle: data.billingCycle,
      creditTerms: data.creditTerms,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.billingProfile.create",
    entityType: "BillingProfile",
    entityId: profile.id,
    newValues: profile,
    ipAddress: getIpAddress(),
  });

  revalidatePath(`/clients/${client.id}`);
  redirect(`/clients/${client.id}?billingCreated=1`);
}

export async function createClientNoteAction(formData: FormData) {
  const actor = await ensureCrmAccess("clients.update");
  const payload = clientNoteFormSchema.safeParse({
    clientId: formData.get("clientId"),
    body: formData.get("body"),
    visibility: formData.get("visibility"),
  });

  if (!payload.success) errorRedirect(`/clients/${String(formData.get("clientId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the note form.");

  const data = payload.data!;
  const client = await clientExists(data.clientId);
  if (!client) errorRedirect("/clients", "Selected client does not exist.");

  const note = await prisma.clientNote.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      body: data.body,
      visibility: data.visibility,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.note.create",
    entityType: "ClientNote",
    entityId: note.id,
    newValues: note,
    ipAddress: getIpAddress(),
  });

  revalidatePath(`/clients/${client.id}`);
  redirect(`/clients/${client.id}?noteCreated=1`);
}

export async function uploadClientFileAction(formData: FormData) {
  const actor = await ensureCrmAccess("client_files.manage");
  const clientId = String(formData.get("clientId") ?? "");
  const file = formData.get("file");
  if (!clientId) errorRedirect("/clients", "Missing client identifier.");
  if (!(file instanceof File) || file.size === 0) errorRedirect(`/clients/${clientId}`, "Attach a file before submitting.");
  const upload = file as File;

  const client = await clientExists(clientId);
  if (!client) errorRedirect("/clients", "Selected client does not exist.");

  const validationError = validateUpload({
    fileName: upload.name,
    mimeType: upload.type || "application/octet-stream",
    sizeBytes: upload.size,
    maxBytes: env.DEFAULT_CLIENT_ATTACHMENT_MAX_MB * 1024 * 1024,
  });
  if (validationError) errorRedirect(`/clients/${clientId}`, validationError);

  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFilename(upload.name)}`;
  const storagePath = buildClientStoragePath(client.workspaceId, client.id, fileName);
  const stored = await saveBinaryToStorage({
    storagePath,
    buffer: Buffer.from(await upload.arrayBuffer()),
    contentType: upload.type || "application/octet-stream",
  });

  const record = await prisma.clientFile.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      fileName,
      originalName: upload.name,
      mimeType: upload.type || "application/octet-stream",
      fileSize: upload.size,
      storagePath: stored.storagePath,
      storageProvider: stored.provider,
      downloadUrl: stored.publicUrl,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.file.upload",
    entityType: "ClientFile",
    entityId: record.id,
    newValues: record,
    ipAddress: getIpAddress(),
  });

  revalidatePath(`/clients/${client.id}`);
  redirect(`/clients/${client.id}?fileCreated=1`);
}

export async function createPortalInvitationAction(formData: FormData) {
  const actor = await ensureCrmAccess("portal_access.manage");
  const payload = portalInvitationFormSchema.safeParse({
    clientId: formData.get("clientId"),
    contactId: formData.get("contactId"),
    role: formData.get("role"),
  });

  if (!payload.success) errorRedirect(`/clients/${String(formData.get("clientId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the portal invitation form.");

  const data = payload.data!;
  const client = await clientExists(data.clientId);
  if (!client) errorRedirect("/clients", "Selected client does not exist.");

  const contact = await prisma.clientContact.findUnique({
    where: { id: data.contactId },
  });
  if (!contact || contact.clientId !== client.id) {
    errorRedirect(`/clients/${client.id}`, "Selected contact does not belong to that client.");
  }

  const invitation = await prisma.portalInvitation.create({
    data: {
      workspaceId: client.workspaceId,
      clientId: client.id,
      contactId: contact.id,
      role: data.role,
      token: randomUUID(),
      status: "PENDING",
      expiresAt: new Date(Date.now() + env.PORTAL_INVITATION_EXPIRY_DAYS * 86_400_000),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "clients.portalInvitation.create",
    entityType: "PortalInvitation",
    entityId: invitation.id,
    newValues: invitation,
    ipAddress: getIpAddress(),
  });

  revalidatePath(`/clients/${client.id}`);
  redirect(`/clients/${client.id}?invited=1`);
}
