"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { prisma, firestoreAdmin } from "@/lib/db";
import { collectionNames } from "@/lib/collections";
import { saveBinaryToStorage, buildWorkspaceStoragePath, sanitizeFilename, validateUpload } from "@/lib/storage";
import {
  assetAssignmentFormSchema,
  assetCustomFieldMapSchema,
  assetFormSchema,
  assetImportFormSchema,
  assetMaintenanceFormSchema,
  assetSoftwareFormSchema,
  assetStatusFormSchema,
  assetTypeFormSchema,
  assetTypeFieldDefinitionSchema,
  softwareLicenceFormSchema,
  assetWarrantyFormSchema,
} from "@/lib/validators";
import {
  assetQrcodeValue,
  assetSearchTokens,
  calculateAssetCompliance,
  calculateAssetHealth,
  calculateWarrantyStatus,
  defaultAssetPrefixFromType,
  requiresDisposalDetails,
  requiresReasonForStatus,
  requiresSensitiveTransitionNote,
  tagFromPrefix,
  canTransitionAssetStatus,
} from "@/lib/assets";

function errorRedirect(pathname: string, message: string) {
  redirect(`${pathname}?error=${encodeURIComponent(message)}`);
}

function getIpAddress() {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers().get("x-real-ip") ?? null;
}

function parseList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonRecord(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  const result = assetCustomFieldMapSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid custom field JSON.");
  }
  return result.data;
}

function parseJsonArray(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  const result = assetTypeFieldDefinitionSchema.array().safeParse(parsed);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid custom field list.");
  }
  return result.data;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumber(value: string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function ensureAssetPermission(permission: string) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes(permission)) redirect("/access-denied");
  return user;
}

async function ensureAssetById(assetId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { assetType: true, client: true, site: true, assignedUser: true, responsibleTechnician: true },
  });
  if (!asset) return null;
  return asset;
}

async function recordAssetEvent({
  assetId,
  actorId,
  eventType,
  description,
  previousValue = null,
  newValue = null,
  relatedTicketId = null,
  relatedUserId = null,
  relatedClientId = null,
  relatedSiteId = null,
  metadata = {},
}: {
  assetId: string;
  actorId: string;
  eventType: string;
  description: string;
  previousValue?: unknown;
  newValue?: unknown;
  relatedTicketId?: string | null;
  relatedUserId?: string | null;
  relatedClientId?: string | null;
  relatedSiteId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.assetEvent.create({
    data: {
      workspaceId: env.DEFAULT_WORKSPACE_ID,
      assetId,
      eventType,
      description,
      actorId,
      source: "server",
      previousValue,
      newValue,
      relatedTicketId,
      relatedUserId,
      relatedClientId,
      relatedSiteId,
      metadata,
    },
  });
}

async function recalculateAssetSnapshot(assetId: string, actorId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { maintenance: true, tickets: true, assetWarranties: true },
  });
  if (!asset) return null;

  const latestWarranty = [...(asset.assetWarranties ?? [])].sort((left, right) => (right.expiryDate?.getTime() ?? 0) - (left.expiryDate?.getTime() ?? 0))[0] ?? null;
  const openCriticalTickets = (asset.tickets ?? []).filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status) && ticket.priority === "URGENT").length;
  const healthState = calculateAssetHealth({
    lastCheckIn: asset.lastCheckIn ?? null,
    freeDiskSpaceGb: asset.freeDiskSpaceGb ?? null,
    antivirusStatus: asset.antivirusStatus ?? null,
    encryptionStatus: asset.encryptionStatus ?? null,
    openCriticalTickets,
    warrantyStatus: latestWarranty ? calculateWarrantyStatus(latestWarranty) : asset.warrantyStatus ?? null,
    hardwareAgeMonths: asset.acquisitionDate ? Math.max(0, Math.floor((Date.now() - asset.acquisitionDate.getTime()) / (30 * 24 * 60 * 60 * 1000))) : null,
    repeatedFailures: (asset.maintenance ?? []).filter((record) => record.outcome?.toLowerCase().includes("fail")).length,
    maintenanceDue: Boolean(asset.nextServiceDate && asset.nextServiceDate.getTime() < Date.now()),
    status: asset.status,
  });
  const complianceState = calculateAssetCompliance({
    antivirusStatus: asset.antivirusStatus ?? null,
    encryptionStatus: asset.encryptionStatus ?? null,
    supportedOs: asset.operatingSystem ? !asset.operatingSystem.toLowerCase().includes("windows 7") : true,
    requiredSoftware: true,
    prohibitedSoftware: false,
    recentCheckIn: asset.lastCheckIn ? Date.now() - asset.lastCheckIn.getTime() < 1000 * 60 * 60 * 24 * 14 : false,
  });

  const snapshot = await prisma.assetHealthSnapshot.create({
    data: {
      workspaceId: asset.workspaceId,
      assetId,
      healthState,
      complianceState,
      calculationVersion: "v1",
      calculatedAt: new Date(),
      factors: {
        lastCheckIn: asset.lastCheckIn,
        freeDiskSpaceGb: asset.freeDiskSpaceGb,
        openCriticalTickets,
        warrantyStatus: latestWarranty ? calculateWarrantyStatus(latestWarranty) : asset.warrantyStatus ?? null,
      },
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await prisma.asset.update({
    where: { id: assetId },
    data: {
      healthState,
      complianceState,
      warrantyStatus: latestWarranty ? calculateWarrantyStatus(latestWarranty) : asset.warrantyStatus,
      healthCalculatedAt: new Date(),
      complianceCalculatedAt: new Date(),
      warrantyCalculatedAt: new Date(),
      updatedById: actorId,
    },
  });

  await recordAssetEvent({
    assetId,
    actorId,
    eventType: "asset.recalculated",
    description: "Asset health and compliance were recalculated.",
    newValue: { healthState, complianceState, warrantyStatus: latestWarranty ? calculateWarrantyStatus(latestWarranty) : asset.warrantyStatus ?? null },
    metadata: { calculationVersion: "v1", snapshotId: snapshot.id },
  });

  return snapshot;
}

async function generateAssetTag(workspaceId: string, prefix: string) {
  const counterRef = firestoreAdmin.collection(collectionNames.assetTagCounters).doc(`${workspaceId}-${prefix}`);
  const result = await firestoreAdmin.runTransaction(async (tx) => {
    const snapshot = await tx.get(counterRef);
    const currentValue = snapshot.exists ? Number(snapshot.get("currentValue") ?? 0) : 0;
    const nextValue = currentValue + 1;
    tx.set(
      counterRef,
      {
        workspaceId,
        prefix,
        currentValue: nextValue,
        updatedAt: new Date(),
        createdAt: snapshot.exists ? snapshot.get("createdAt") ?? new Date() : new Date(),
      },
      { merge: true },
    );
    return tagFromPrefix(prefix, nextValue);
  });
  return result;
}

function getAssetTypePayload(formData: FormData) {
  return assetTypeFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    icon: formData.get("icon"),
    category: formData.get("category"),
    prefix: formData.get("prefix"),
    active: formData.get("active") !== "false",
    requiredFields: parseList(formData.get("requiredFields")),
    customFields: parseJsonArray(formData.get("customFieldsJson")),
  });
}

function getAssetPayload(formData: FormData) {
  return assetFormSchema.safeParse({
    assetTypeId: formData.get("assetTypeId"),
    assetTag: formData.get("assetTag"),
    name: formData.get("name"),
    category: formData.get("category"),
    status: formData.get("status"),
    ownershipType: formData.get("ownershipType"),
    clientId: formData.get("clientId"),
    siteId: formData.get("siteId"),
    contactId: formData.get("contactId"),
    assignedUserId: formData.get("assignedUserId"),
    responsibleTechnicianId: formData.get("responsibleTechnicianId"),
    department: formData.get("department"),
    physicalLocation: formData.get("physicalLocation"),
    manufacturer: formData.get("manufacturer"),
    model: formData.get("model"),
    serialNumber: formData.get("serialNumber"),
    barcode: formData.get("barcode"),
    qrCodeValue: formData.get("qrCodeValue"),
    description: formData.get("description"),
    internalNotes: formData.get("internalNotes"),
    cpu: formData.get("cpu"),
    ram: formData.get("ram"),
    storageCapacity: formData.get("storageCapacity"),
    storageType: formData.get("storageType"),
    operatingSystem: formData.get("operatingSystem"),
    windowsVersion: formData.get("windowsVersion"),
    architecture: formData.get("architecture"),
    hostname: formData.get("hostname"),
    ipAddress: formData.get("ipAddress"),
    macAddress: formData.get("macAddress"),
    networkDomain: formData.get("networkDomain"),
    biosVersion: formData.get("biosVersion"),
    motherboard: formData.get("motherboard"),
    screenSizeInches: formData.get("screenSizeInches"),
    batteryHealth: formData.get("batteryHealth"),
    antivirusProduct: formData.get("antivirusProduct"),
    antivirusStatus: formData.get("antivirusStatus"),
    encryptionStatus: formData.get("encryptionStatus"),
    bitLockerStatus: formData.get("bitLockerStatus"),
    firewallStatus: formData.get("firewallStatus"),
    lastLoggedInUser: formData.get("lastLoggedInUser"),
    lastCheckIn: formData.get("lastCheckIn"),
    uptime: formData.get("uptime"),
    freeDiskSpaceGb: formData.get("freeDiskSpaceGb"),
    healthState: formData.get("healthState"),
    complianceState: formData.get("complianceState"),
    monitoringState: formData.get("monitoringState"),
    supplier: formData.get("supplier"),
    purchaseDate: formData.get("purchaseDate"),
    purchasePrice: formData.get("purchasePrice"),
    currency: formData.get("currency"),
    invoiceReference: formData.get("invoiceReference"),
    warrantyStartDate: formData.get("warrantyStartDate"),
    warrantyExpiryDate: formData.get("warrantyExpiryDate"),
    warrantyProvider: formData.get("warrantyProvider"),
    warrantyReference: formData.get("warrantyReference"),
    warrantyStatus: formData.get("warrantyStatus"),
    replacementValue: formData.get("replacementValue"),
    expectedReplacementDate: formData.get("expectedReplacementDate"),
    acquisitionDate: formData.get("acquisitionDate"),
    deploymentDate: formData.get("deploymentDate"),
    lastServiceDate: formData.get("lastServiceDate"),
    nextServiceDate: formData.get("nextServiceDate"),
    retirementDate: formData.get("retirementDate"),
    disposalDate: formData.get("disposalDate"),
    disposalMethod: formData.get("disposalMethod"),
    disposalCertificate: formData.get("disposalCertificate"),
    customFields: parseJsonRecord(formData.get("customFieldsJson")),
  });
}

function getAssignmentTargetLabel(type: string, asset: { clientId?: string | null; siteId?: string | null; contactId?: string | null; assignedUserId?: string | null; department?: string | null; physicalLocation?: string | null }) {
  switch (type) {
    case "CLIENT":
      return asset.clientId;
    case "SITE":
      return asset.siteId;
    case "CONTACT":
      return asset.contactId;
    case "USER":
      return asset.assignedUserId;
    case "DEPARTMENT":
      return asset.department;
    case "STORAGE":
      return asset.physicalLocation;
    default:
      return null;
  }
}

export async function createAssetTypeAction(formData: FormData) {
  const actor = await ensureAssetPermission("assetTypes.manage");
  const payload = getAssetTypePayload(formData);
  if (!payload.success) errorRedirect("/administration/asset-types/new", payload.error.issues[0]?.message ?? "Please review the asset type form.");

  const data = payload.data!;
  const existing = await prisma.assetType.findFirst({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, name: data.name } });
  if (existing) errorRedirect("/administration/asset-types/new", "An asset type with that name already exists.");

  const record = await prisma.assetType.create({
    data: {
      workspaceId: env.DEFAULT_WORKSPACE_ID,
      name: data.name,
      description: data.description || null,
      icon: data.icon,
      category: data.category,
      prefix: data.prefix.toUpperCase(),
      active: data.active,
      requiredFields: data.requiredFields,
      customFields: data.customFields,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "assetTypes.create",
    entityType: "AssetType",
    entityId: record.id,
    newValues: record,
    ipAddress: getIpAddress(),
  });

  redirect("/administration/asset-types?created=1");
}

export async function updateAssetTypeAction(formData: FormData) {
  const actor = await ensureAssetPermission("assetTypes.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) errorRedirect("/administration/asset-types", "Missing asset type identifier.");
  const payload = getAssetTypePayload(formData);
  if (!payload.success) errorRedirect(`/administration/asset-types/${id}`, payload.error.issues[0]?.message ?? "Please review the asset type form.");

  const data = payload.data!;
  const existing = await prisma.assetType.findUnique({ where: { id } });
  if (!existing) errorRedirect("/administration/asset-types", "Selected asset type does not exist.");

  const updated = await prisma.assetType.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description || null,
      icon: data.icon,
      category: data.category,
      prefix: data.prefix.toUpperCase(),
      active: data.active,
      requiredFields: data.requiredFields,
      customFields: data.customFields,
      updatedById: actor.id,
    },
  });

  await logAudit({
    userId: actor.id,
    action: "assetTypes.update",
    entityType: "AssetType",
    entityId: id,
    previousValues: existing,
    newValues: updated,
    ipAddress: getIpAddress(),
  });

  redirect(`/administration/asset-types/${id}?updated=1`);
}

export async function toggleAssetTypeAction(formData: FormData) {
  const actor = await ensureAssetPermission("assetTypes.manage");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) errorRedirect("/administration/asset-types", "Missing asset type identifier.");
  const existing = await prisma.assetType.findUnique({ where: { id } });
  if (!existing) errorRedirect("/administration/asset-types", "Selected asset type does not exist.");

  const updated = await prisma.assetType.update({
    where: { id },
    data: { active, updatedById: actor.id },
  });

  await logAudit({
    userId: actor.id,
    action: "assetTypes.toggle",
    entityType: "AssetType",
    entityId: id,
    previousValues: existing,
    newValues: updated,
    ipAddress: getIpAddress(),
  });

  redirect(`/administration/asset-types/${id}?updated=1`);
}

export async function createAssetAction(formData: FormData) {
  const actor = await ensureAssetPermission("assets.create");
  const payload = getAssetPayload(formData);
  if (!payload.success) errorRedirect("/assets/new", payload.error.issues[0]?.message ?? "Please review the asset form.");
  const data = payload.data!;

  const assetType = await prisma.assetType.findUnique({ where: { id: data.assetTypeId } });
  if (!assetType || assetType.workspaceId !== env.DEFAULT_WORKSPACE_ID) errorRedirect("/assets/new", "Selected asset type does not exist.");

  const client = data.clientId ? await prisma.client.findUnique({ where: { id: data.clientId } }) : null;
  const site = data.siteId ? await prisma.clientSite.findUnique({ where: { id: data.siteId } }) : null;
  if (data.clientId && !client) errorRedirect("/assets/new", "Selected client does not exist.");
  if (data.siteId && (!site || site.clientId !== client?.id)) errorRedirect("/assets/new", "Selected site does not belong to that client.");

  const assetId = randomUUID();
  const assetTag = await generateAssetTag(env.DEFAULT_WORKSPACE_ID, assetType.prefix);
  const qrcodeValue = assetQrcodeValue(env.NEXT_PUBLIC_APP_URL, assetId);
  const searchTokens = assetSearchTokens([
    assetTag,
    data.name,
    data.serialNumber ?? "",
    data.manufacturer ?? "",
    data.model ?? "",
    data.hostname ?? "",
    data.ipAddress ?? "",
    data.macAddress ?? "",
    client?.name,
    site?.name,
  ]);

  const now = new Date();
  await prisma.asset.create({
    data: {
      id: assetId,
      workspaceId: env.DEFAULT_WORKSPACE_ID,
      assetTag,
      assetTypeId: assetType.id,
      category: data.category,
      name: data.name,
      status: data.status,
      ownershipType: data.ownershipType,
      clientId: client?.id ?? null,
      siteId: site?.id ?? null,
      contactId: data.contactId || null,
      assignedUserId: data.assignedUserId || null,
      responsibleTechnicianId: data.responsibleTechnicianId || null,
      department: data.department || null,
      physicalLocation: data.physicalLocation || null,
      manufacturer: data.manufacturer || null,
      model: data.model || null,
      serialNumber: data.serialNumber || null,
      barcode: data.barcode || null,
      qrCodeValue: qrcodeValue,
      description: data.description || null,
      internalNotes: data.internalNotes || null,
      cpu: data.cpu || null,
      ram: data.ram || null,
      storageCapacity: data.storageCapacity || null,
      storageType: data.storageType || null,
      operatingSystem: data.operatingSystem || null,
      windowsVersion: data.windowsVersion || null,
      architecture: data.architecture || null,
      hostname: data.hostname || null,
      ipAddress: data.ipAddress || null,
      macAddress: data.macAddress || null,
      networkDomain: data.networkDomain || null,
      biosVersion: data.biosVersion || null,
      motherboard: data.motherboard || null,
      screenSizeInches: data.screenSizeInches ?? null,
      batteryHealth: data.batteryHealth || null,
      antivirusProduct: data.antivirusProduct || null,
      antivirusStatus: data.antivirusStatus || null,
      encryptionStatus: data.encryptionStatus || null,
      bitLockerStatus: data.bitLockerStatus || null,
      firewallStatus: data.firewallStatus || null,
      lastLoggedInUser: data.lastLoggedInUser || null,
      lastCheckIn: parseDate(data.lastCheckIn),
      uptime: data.uptime || null,
      freeDiskSpaceGb: data.freeDiskSpaceGb ?? null,
      healthState: data.healthState || "UNKNOWN",
      complianceState: data.complianceState || "UNKNOWN",
      monitoringState: data.monitoringState || null,
      supplier: data.supplier || null,
      purchaseDate: parseDate(data.purchaseDate),
      purchasePrice: data.purchasePrice || null,
      currency: data.currency || null,
      invoiceReference: data.invoiceReference || null,
      warrantyStartDate: parseDate(data.warrantyStartDate),
      warrantyExpiryDate: parseDate(data.warrantyExpiryDate),
      warrantyProvider: data.warrantyProvider || null,
      warrantyReference: data.warrantyReference || null,
      warrantyStatus: data.warrantyStatus || null,
      replacementValue: data.replacementValue || null,
      expectedReplacementDate: parseDate(data.expectedReplacementDate),
      acquisitionDate: parseDate(data.acquisitionDate),
      deploymentDate: parseDate(data.deploymentDate),
      lastServiceDate: parseDate(data.lastServiceDate),
      nextServiceDate: parseDate(data.nextServiceDate),
      retirementDate: parseDate(data.retirementDate),
      disposalDate: parseDate(data.disposalDate),
      disposalMethod: data.disposalMethod || null,
      disposalCertificate: data.disposalCertificate || null,
      customFields: data.customFields,
      searchTokens,
      createdById: actor.id,
      updatedById: actor.id,
      createdAt: now,
      updatedAt: now,
    },
  });

  await recordAssetEvent({
    assetId,
    actorId: actor.id,
    eventType: "asset.created",
    description: `Created asset ${assetTag}.`,
    newValue: { assetTag, name: data.name, assetTypeId: assetType.id, clientId: client?.id ?? null, siteId: site?.id ?? null },
  });

  await recalculateAssetSnapshot(assetId, actor.id);

  await logAudit({
    userId: actor.id,
    action: "assets.create",
    entityType: "Asset",
    entityId: assetId,
    newValues: { assetTag, name: data.name, assetTypeId: assetType.id },
    ipAddress: getIpAddress(),
  });

  redirect(`/assets/${assetId}?created=1`);
}

export async function updateAssetAction(formData: FormData) {
  const actor = await ensureAssetPermission("assets.update");
  const id = String(formData.get("id") ?? "");
  if (!id) errorRedirect("/assets", "Missing asset identifier.");
  const existing = await ensureAssetById(id);
  if (!existing) errorRedirect("/assets", "Selected asset does not exist.");

  const payload = getAssetPayload(formData);
  if (!payload.success) errorRedirect(`/assets/${id}`, payload.error.issues[0]?.message ?? "Please review the asset form.");
  const data = payload.data!;
  const assetType = await prisma.assetType.findUnique({ where: { id: data.assetTypeId } });
  if (!assetType) errorRedirect(`/assets/${id}`, "Selected asset type does not exist.");

  const client = data.clientId ? await prisma.client.findUnique({ where: { id: data.clientId } }) : null;
  const site = data.siteId ? await prisma.clientSite.findUnique({ where: { id: data.siteId } }) : null;
  if (data.clientId && !client) errorRedirect(`/assets/${id}`, "Selected client does not exist.");
  if (data.siteId && (!site || site.clientId !== client?.id)) errorRedirect(`/assets/${id}`, "Selected site does not belong to that client.");

  const searchTokens = assetSearchTokens([
    existing.assetTag,
    data.name,
    data.serialNumber ?? "",
    data.manufacturer ?? "",
    data.model ?? "",
    data.hostname ?? "",
    data.ipAddress ?? "",
    data.macAddress ?? "",
    client?.name,
    site?.name,
  ]);

  const updated = await prisma.asset.update({
    where: { id },
    data: {
      assetTypeId: assetType.id,
      category: data.category,
      name: data.name,
      status: data.status,
      ownershipType: data.ownershipType,
      clientId: client?.id ?? null,
      siteId: site?.id ?? null,
      contactId: data.contactId || null,
      assignedUserId: data.assignedUserId || null,
      responsibleTechnicianId: data.responsibleTechnicianId || null,
      department: data.department || null,
      physicalLocation: data.physicalLocation || null,
      manufacturer: data.manufacturer || null,
      model: data.model || null,
      serialNumber: data.serialNumber || null,
      barcode: data.barcode || null,
      qrCodeValue: data.qrCodeValue || existing.qrCodeValue,
      description: data.description || null,
      internalNotes: data.internalNotes || null,
      cpu: data.cpu || null,
      ram: data.ram || null,
      storageCapacity: data.storageCapacity || null,
      storageType: data.storageType || null,
      operatingSystem: data.operatingSystem || null,
      windowsVersion: data.windowsVersion || null,
      architecture: data.architecture || null,
      hostname: data.hostname || null,
      ipAddress: data.ipAddress || null,
      macAddress: data.macAddress || null,
      networkDomain: data.networkDomain || null,
      biosVersion: data.biosVersion || null,
      motherboard: data.motherboard || null,
      screenSizeInches: data.screenSizeInches ?? null,
      batteryHealth: data.batteryHealth || null,
      antivirusProduct: data.antivirusProduct || null,
      antivirusStatus: data.antivirusStatus || null,
      encryptionStatus: data.encryptionStatus || null,
      bitLockerStatus: data.bitLockerStatus || null,
      firewallStatus: data.firewallStatus || null,
      lastLoggedInUser: data.lastLoggedInUser || null,
      lastCheckIn: parseDate(data.lastCheckIn),
      uptime: data.uptime || null,
      freeDiskSpaceGb: data.freeDiskSpaceGb ?? null,
      healthState: data.healthState || existing.healthState,
      complianceState: data.complianceState || existing.complianceState,
      monitoringState: data.monitoringState || null,
      supplier: data.supplier || null,
      purchaseDate: parseDate(data.purchaseDate),
      purchasePrice: data.purchasePrice || null,
      currency: data.currency || null,
      invoiceReference: data.invoiceReference || null,
      warrantyStartDate: parseDate(data.warrantyStartDate),
      warrantyExpiryDate: parseDate(data.warrantyExpiryDate),
      warrantyProvider: data.warrantyProvider || null,
      warrantyReference: data.warrantyReference || null,
      warrantyStatus: data.warrantyStatus || null,
      replacementValue: data.replacementValue || null,
      expectedReplacementDate: parseDate(data.expectedReplacementDate),
      acquisitionDate: parseDate(data.acquisitionDate),
      deploymentDate: parseDate(data.deploymentDate),
      lastServiceDate: parseDate(data.lastServiceDate),
      nextServiceDate: parseDate(data.nextServiceDate),
      retirementDate: parseDate(data.retirementDate),
      disposalDate: parseDate(data.disposalDate),
      disposalMethod: data.disposalMethod || null,
      disposalCertificate: data.disposalCertificate || null,
      customFields: data.customFields,
      searchTokens,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId: id,
    actorId: actor.id,
    eventType: "asset.updated",
    description: "Asset record updated.",
    previousValue: {
      assetTypeId: existing.assetTypeId,
      name: existing.name,
      status: existing.status,
      clientId: existing.clientId,
      siteId: existing.siteId,
    },
    newValue: {
      assetTypeId: updated.assetTypeId,
      name: updated.name,
      status: updated.status,
      clientId: updated.clientId,
      siteId: updated.siteId,
    },
  });

  await recalculateAssetSnapshot(id, actor.id);
  await logAudit({
    userId: actor.id,
    action: "assets.update",
    entityType: "Asset",
    entityId: id,
    previousValues: existing,
    newValues: updated,
    ipAddress: getIpAddress(),
  });

  redirect(`/assets/${id}?updated=1`);
}

export async function changeAssetStatusAction(formData: FormData) {
  const actor = await ensureAssetPermission("assets.update");
  const payload = assetStatusFormSchema.safeParse({
    assetId: formData.get("assetId"),
    status: formData.get("status"),
    notes: formData.get("notes"),
    reason: formData.get("reason"),
    disposalMethod: formData.get("disposalMethod"),
    disposalCertificate: formData.get("disposalCertificate"),
  });
  if (!payload.success) errorRedirect(`/assets/${String(formData.get("assetId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the status form.");
  const data = payload.data!;
  const asset = await ensureAssetById(data.assetId);
  if (!asset) errorRedirect("/assets", "Selected asset does not exist.");
  if (!canTransitionAssetStatus(asset.status, data.status)) errorRedirect(`/assets/${data.assetId}`, "That status transition is not allowed.");
  if (requiresReasonForStatus(data.status) && !String(data.reason ?? "").trim()) errorRedirect(`/assets/${data.assetId}`, "A reason is required for lost or stolen assets.");
  if (requiresDisposalDetails(data.status) && (!String(data.disposalMethod ?? "").trim() || !String(data.disposalCertificate ?? "").trim())) {
    errorRedirect(`/assets/${data.assetId}`, "Disposal method and certificate are required.");
  }
  if (requiresSensitiveTransitionNote(asset.status, data.status) && !String(data.notes ?? "").trim()) {
    errorRedirect(`/assets/${data.assetId}`, "A transition note is required for this status change.");
  }

  const updated = await prisma.asset.update({
    where: { id: data.assetId },
    data: {
      status: data.status,
      notes: String(data.notes ?? "").trim() || asset.notes,
      reason: String(data.reason ?? "").trim() || asset.reason,
      disposalMethod: String(data.disposalMethod ?? "").trim() || asset.disposalMethod,
      disposalCertificate: String(data.disposalCertificate ?? "").trim() || asset.disposalCertificate,
      archivedAt: data.status === "ARCHIVED" ? asset.archivedAt ?? new Date() : asset.archivedAt,
      retiredAt: data.status === "RETIRED" ? asset.retiredAt ?? new Date() : asset.retiredAt,
      disposedAt: data.status === "DISPOSED" ? asset.disposedAt ?? new Date() : asset.disposedAt,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId: data.assetId,
    actorId: actor.id,
    eventType: "asset.status_changed",
    description: `Asset status changed from ${asset.status} to ${data.status}.`,
    previousValue: { status: asset.status },
    newValue: { status: data.status },
    metadata: { notes: data.notes, reason: data.reason },
  });

  await recalculateAssetSnapshot(data.assetId, actor.id);
  await logAudit({
    userId: actor.id,
    action: "assets.status",
    entityType: "Asset",
    entityId: data.assetId,
    previousValues: { status: asset.status },
    newValues: { status: updated.status },
    ipAddress: getIpAddress(),
  });

  redirect(`/assets/${data.assetId}?statusChanged=1`);
}

export async function assignAssetAction(formData: FormData) {
  const actor = await ensureAssetPermission("assets.assign");
  const payload = assetAssignmentFormSchema.safeParse({
    assetId: formData.get("assetId"),
    assignmentType: formData.get("assignmentType"),
    targetId: formData.get("targetId"),
    notes: formData.get("notes"),
    transferNotes: formData.get("transferNotes"),
  });
  if (!payload.success) errorRedirect(`/assets/${String(formData.get("assetId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the assignment form.");
  const data = payload.data!;
  const asset = await ensureAssetById(data.assetId);
  if (!asset) errorRedirect("/assets", "Selected asset does not exist.");
  if (["ARCHIVED", "DISPOSED"].includes(asset.status)) errorRedirect(`/assets/${data.assetId}`, "Archived or disposed assets cannot be assigned.");

  const previousAssignment = {
    clientId: asset.clientId,
    siteId: asset.siteId,
    contactId: asset.contactId,
    assignedUserId: asset.assignedUserId,
    department: asset.department,
    physicalLocation: asset.physicalLocation,
  };

  const nextAssignment = {
    clientId: asset.clientId,
    siteId: asset.siteId,
    contactId: asset.contactId,
    assignedUserId: asset.assignedUserId,
    department: asset.department,
    physicalLocation: asset.physicalLocation,
  };

  switch (data.assignmentType) {
    case "CLIENT":
      nextAssignment.clientId = data.targetId || null;
      nextAssignment.siteId = null;
      nextAssignment.contactId = null;
      break;
    case "SITE":
      nextAssignment.siteId = data.targetId || null;
      break;
    case "CONTACT":
      nextAssignment.contactId = data.targetId || null;
      break;
    case "USER":
      nextAssignment.assignedUserId = data.targetId || null;
      break;
    case "DEPARTMENT":
      nextAssignment.department = data.targetId || null;
      break;
    case "STORAGE":
      nextAssignment.physicalLocation = data.targetId || null;
      break;
  }

  await prisma.asset.update({
    where: { id: data.assetId },
    data: {
      ...nextAssignment,
      updatedById: actor.id,
    },
  });

  await prisma.assetAssignment.create({
    data: {
      workspaceId: asset.workspaceId,
      assetId: data.assetId,
      assignmentType: data.assignmentType,
      previousAssignment,
      newAssignment: nextAssignment,
      notes: data.notes || null,
      transferNotes: data.transferNotes || null,
      assignedById: actor.id,
      assignedAt: new Date(),
      active: true,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId: data.assetId,
    actorId: actor.id,
    eventType: "asset.assigned",
    description: `Asset assigned to ${data.assignmentType.toLowerCase()}.`,
    previousValue: previousAssignment,
    newValue: nextAssignment,
    metadata: { assignmentType: data.assignmentType, notes: data.notes, transferNotes: data.transferNotes },
  });

  await recalculateAssetSnapshot(data.assetId, actor.id);
  await logAudit({
    userId: actor.id,
    action: "assets.assign",
    entityType: "Asset",
    entityId: data.assetId,
    previousValues: previousAssignment,
    newValues: nextAssignment,
    ipAddress: getIpAddress(),
  });

  redirect(`/assets/${data.assetId}?assigned=1`);
}

export async function returnAssetAction(formData: FormData) {
  const actor = await ensureAssetPermission("assets.assign");
  const assetId = String(formData.get("assetId") ?? "");
  if (!assetId) errorRedirect("/assets", "Missing asset identifier.");
  const asset = await ensureAssetById(assetId);
  if (!asset) errorRedirect("/assets", "Selected asset does not exist.");
  if (["ARCHIVED", "DISPOSED"].includes(asset.status)) errorRedirect(`/assets/${assetId}`, "Archived or disposed assets cannot be returned.");

  await prisma.asset.update({
    where: { id: assetId },
    data: {
      clientId: null,
      siteId: null,
      contactId: null,
      assignedUserId: null,
      updatedById: actor.id,
    },
  });

  await prisma.assetAssignment.create({
    data: {
      workspaceId: asset.workspaceId,
      assetId,
      assignmentType: "STORAGE",
      previousAssignment: {
        clientId: asset.clientId,
        siteId: asset.siteId,
        contactId: asset.contactId,
        assignedUserId: asset.assignedUserId,
      },
      newAssignment: { clientId: null, siteId: null, contactId: null, assignedUserId: null },
      notes: String(formData.get("notes") ?? "") || null,
      assignedById: actor.id,
      assignedAt: new Date(),
      active: false,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId,
    actorId: actor.id,
    eventType: "asset.returned",
    description: "Asset returned to storage.",
    previousValue: { clientId: asset.clientId, siteId: asset.siteId, assignedUserId: asset.assignedUserId },
    newValue: { clientId: null, siteId: null, assignedUserId: null },
    metadata: { notes: String(formData.get("notes") ?? "") || null },
  });

  await logAudit({
    userId: actor.id,
    action: "assets.return",
    entityType: "Asset",
    entityId: assetId,
    previousValues: { clientId: asset.clientId, siteId: asset.siteId, assignedUserId: asset.assignedUserId },
    newValues: { clientId: null, siteId: null, assignedUserId: null },
    ipAddress: getIpAddress(),
  });

  redirect(`/assets/${assetId}?returned=1`);
}

export async function createAssetMaintenanceAction(formData: FormData) {
  const actor = await ensureAssetPermission("asset_maintenance.manage");
  const payload = assetMaintenanceFormSchema.safeParse({
    assetId: formData.get("assetId"),
    maintenanceType: formData.get("maintenanceType"),
    description: formData.get("description"),
    technicianId: formData.get("technicianId"),
    supplier: formData.get("supplier"),
    ticketId: formData.get("ticketId"),
    startDate: formData.get("startDate"),
    completionDate: formData.get("completionDate"),
    cost: formData.get("cost"),
    currency: formData.get("currency"),
    partsReplaced: formData.get("partsReplaced"),
    downtimeMinutes: formData.get("downtimeMinutes"),
    outcome: formData.get("outcome"),
    nextServiceDate: formData.get("nextServiceDate"),
    notes: formData.get("notes"),
  });
  if (!payload.success) errorRedirect(`/assets/${String(formData.get("assetId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the maintenance form.");
  const data = payload.data!;
  const asset = await ensureAssetById(data.assetId);
  if (!asset) errorRedirect("/assets", "Selected asset does not exist.");

  const record = await prisma.assetMaintenance.create({
    data: {
      workspaceId: asset.workspaceId,
      assetId: data.assetId,
      maintenanceType: data.maintenanceType,
      description: data.description,
      technicianId: data.technicianId || null,
      supplier: data.supplier || null,
      ticketId: data.ticketId || null,
      startDate: new Date(data.startDate),
      completionDate: parseDate(data.completionDate),
      cost: data.cost || null,
      currency: data.currency || null,
      partsReplaced: parseList(String(data.partsReplaced ?? "")).join(", "),
      downtimeMinutes: data.downtimeMinutes,
      outcome: data.outcome || null,
      nextServiceDate: parseDate(data.nextServiceDate),
      notes: data.notes || null,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId: data.assetId,
    actorId: actor.id,
    eventType: "asset.maintenance",
    description: data.description,
    relatedTicketId: data.ticketId || null,
    relatedUserId: data.technicianId || null,
    newValue: record,
  });

  await recalculateAssetSnapshot(data.assetId, actor.id);
  redirect(`/assets/${data.assetId}?maintenanceCreated=1`);
}

export async function createAssetWarrantyAction(formData: FormData) {
  const actor = await ensureAssetPermission("assets.update");
  const payload = assetWarrantyFormSchema.safeParse({
    assetId: formData.get("assetId"),
    provider: formData.get("provider"),
    reference: formData.get("reference"),
    startDate: formData.get("startDate"),
    expiryDate: formData.get("expiryDate"),
    warrantyType: formData.get("warrantyType"),
    coverageDetails: formData.get("coverageDetails"),
    contactInfo: formData.get("contactInfo"),
    claimHistory: formData.get("claimHistory"),
    notes: formData.get("notes"),
  });
  if (!payload.success) errorRedirect(`/assets/${String(formData.get("assetId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the warranty form.");
  const data = payload.data!;
  const asset = await ensureAssetById(data.assetId);
  if (!asset) errorRedirect("/assets", "Selected asset does not exist.");

  const record = await prisma.assetWarranty.create({
    data: {
      workspaceId: asset.workspaceId,
      assetId: data.assetId,
      provider: data.provider,
      reference: data.reference || null,
      startDate: parseDate(data.startDate),
      expiryDate: parseDate(data.expiryDate),
      warrantyType: data.warrantyType || null,
      coverageDetails: data.coverageDetails || null,
      contactInfo: data.contactInfo || null,
      claimHistory: data.claimHistory || null,
      notes: data.notes || null,
      status: calculateWarrantyStatus({ expiryDate: parseDate(data.expiryDate) ?? null }),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId: data.assetId,
    actorId: actor.id,
    eventType: "asset.warranty_updated",
    description: "Warranty record updated.",
    newValue: record,
  });

  await recalculateAssetSnapshot(data.assetId, actor.id);
  redirect(`/assets/${data.assetId}?warrantyUpdated=1`);
}

export async function uploadAssetFileAction(formData: FormData) {
  const actor = await ensureAssetPermission("asset_files.manage");
  const assetId = String(formData.get("assetId") ?? "");
  const category = String(formData.get("category") ?? "other");
  const description = String(formData.get("description") ?? "");
  const file = formData.get("file");
  if (!assetId) errorRedirect("/assets", "Missing asset identifier.");
  if (!(file instanceof File) || file.size === 0) errorRedirect(`/assets/${assetId}`, "Attach a file before submitting.");
  const upload = file as File;
  const asset = await ensureAssetById(assetId);
  if (!asset) errorRedirect("/assets", "Selected asset does not exist.");

  const validationError = validateUpload({
    fileName: upload.name,
    mimeType: upload.type || "application/octet-stream",
    sizeBytes: upload.size,
    maxBytes: env.DEFAULT_CLIENT_ATTACHMENT_MAX_MB * 1024 * 1024,
  });
  if (validationError) errorRedirect(`/assets/${assetId}`, validationError);

  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFilename(upload.name)}`;
  const storagePath = buildWorkspaceStoragePath(asset.workspaceId, "assets", assetId, fileName);
  const stored = await saveBinaryToStorage({
    storagePath,
    buffer: Buffer.from(await upload.arrayBuffer()),
    contentType: upload.type || "application/octet-stream",
  });

  const record = await prisma.assetFile.create({
    data: {
      workspaceId: asset.workspaceId,
      assetId,
      category,
      description: description || null,
      fileName,
      originalName: upload.name,
      mimeType: upload.type || "application/octet-stream",
      fileSize: upload.size,
      storagePath: stored.storagePath,
      storageProvider: stored.provider,
      downloadUrl: stored.publicUrl,
      uploadedById: actor.id,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId,
    actorId: actor.id,
    eventType: "asset.file_uploaded",
    description: `Uploaded ${upload.name}.`,
    newValue: record,
  });

  redirect(`/assets/${assetId}?fileCreated=1`);
}

export async function createAssetSoftwareAction(formData: FormData) {
  const actor = await ensureAssetPermission("asset_software.manage");
  const payload = assetSoftwareFormSchema.safeParse({
    assetId: formData.get("assetId"),
    softwareName: formData.get("softwareName"),
    publisher: formData.get("publisher"),
    version: formData.get("version"),
    installationDate: formData.get("installationDate"),
    installationSource: formData.get("installationSource"),
    licenceId: formData.get("licenceId"),
    detectionSource: formData.get("detectionSource"),
    lastDetectedDate: formData.get("lastDetectedDate"),
    approved: formData.get("approved") === "true",
    securityRiskState: formData.get("securityRiskState"),
    removalDate: formData.get("removalDate"),
  });
  if (!payload.success) errorRedirect(`/assets/${String(formData.get("assetId") ?? "")}`, payload.error.issues[0]?.message ?? "Please review the software form.");
  const data = payload.data!;
  const asset = await ensureAssetById(data.assetId);
  if (!asset) errorRedirect("/assets", "Selected asset does not exist.");

  const record = await prisma.assetSoftware.create({
    data: {
      workspaceId: asset.workspaceId,
      assetId: data.assetId,
      softwareName: data.softwareName,
      publisher: data.publisher || null,
      version: data.version || null,
      installationDate: parseDate(data.installationDate),
      installationSource: data.installationSource || null,
      licenceId: data.licenceId || null,
      detectionSource: data.detectionSource || null,
      lastDetectedDate: parseDate(data.lastDetectedDate),
      approved: data.approved,
      securityRiskState: data.securityRiskState || null,
      removalDate: parseDate(data.removalDate),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId: data.assetId,
    actorId: actor.id,
    eventType: "asset.software_installed",
    description: `${data.softwareName} installed.`,
    newValue: record,
  });

  redirect(`/assets/${data.assetId}?softwareCreated=1`);
}

export async function createSoftwareLicenceAction(formData: FormData) {
  const actor = await ensureAssetPermission("asset_licences.manage");
  const payload = softwareLicenceFormSchema.safeParse({
    productName: formData.get("productName"),
    publisher: formData.get("publisher"),
    licenceType: formData.get("licenceType"),
    licenceReference: formData.get("licenceReference"),
    clientId: formData.get("clientId"),
    totalSeats: formData.get("totalSeats"),
    purchaseDate: formData.get("purchaseDate"),
    renewalDate: formData.get("renewalDate"),
    expiryDate: formData.get("expiryDate"),
    cost: formData.get("cost"),
    currency: formData.get("currency"),
    supplier: formData.get("supplier"),
    status: formData.get("status"),
    secureNotes: formData.get("secureNotes"),
    contractId: formData.get("contractId"),
  });
  if (!payload.success) errorRedirect("/assets", payload.error.issues[0]?.message ?? "Please review the licence form.");
  const data = payload.data!;
  const client = data.clientId ? await prisma.client.findUnique({ where: { id: data.clientId } }) : null;
  if (data.clientId && !client) errorRedirect("/assets", "Selected client does not exist.");

  const record = await prisma.softwareLicence.create({
    data: {
      workspaceId: env.DEFAULT_WORKSPACE_ID,
      productName: data.productName,
      publisher: data.publisher || null,
      licenceType: data.licenceType,
      licenceReference: data.licenceReference,
      clientId: client?.id ?? null,
      totalSeats: data.totalSeats,
      usedSeats: 0,
      availableSeats: data.totalSeats,
      purchaseDate: parseDate(data.purchaseDate),
      renewalDate: parseDate(data.renewalDate),
      expiryDate: parseDate(data.expiryDate),
      cost: data.cost || null,
      currency: data.currency || null,
      supplier: data.supplier || null,
      status: data.status,
      secureNotes: data.secureNotes || null,
      contractId: data.contractId || null,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await recordAssetEvent({
    assetId: record.id,
    actorId: actor.id,
    eventType: "licence.created",
    description: `Created software licence ${data.productName}.`,
    newValue: record,
  });

  redirect(`/assets?licenceCreated=1`);
}

export async function importAssetsAction(formData: FormData) {
  const actor = await ensureAssetPermission("assets.import");
  const payload = assetImportFormSchema.safeParse({
    importKey: formData.get("importKey"),
    csvContent: formData.get("csvContent"),
  });
  if (!payload.success) errorRedirect("/assets/import", payload.error.issues[0]?.message ?? "Please review the import data.");
  const data = payload.data!;
  const existingImport = await prisma.assetImport.findUnique({ where: { importKey: data.importKey } });
  if (existingImport) redirect("/assets/import?duplicate=1");

  const rows = parseCsv(data.csvContent);
  const created: Array<{ tag: string; id: string }> = [];
  for (const row of rows) {
    if (!row.name || !row.assetTypeId) continue;
    const assetType = await prisma.assetType.findUnique({ where: { id: row.assetTypeId } });
    if (!assetType) continue;
    const assetId = randomUUID();
    const assetTag = row.assetTag || (await generateAssetTag(env.DEFAULT_WORKSPACE_ID, assetType.prefix));
    await prisma.asset.create({
      data: {
        id: assetId,
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        assetTag,
        assetTypeId: assetType.id,
        category: row.category || assetType.category,
        name: row.name,
        status: row.status || "IN_STOCK",
        ownershipType: row.ownershipType || "INTERNAL",
        serialNumber: row.serialNumber || null,
        manufacturer: row.manufacturer || null,
        model: row.model || null,
        clientId: null,
        siteId: null,
        customFields: {},
        searchTokens: assetSearchTokens([assetTag, row.name, row.serialNumber, row.manufacturer, row.model]),
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    created.push({ tag: assetTag, id: assetId });
  }

  await prisma.assetImport.create({
    data: {
      workspaceId: env.DEFAULT_WORKSPACE_ID,
      importKey: data.importKey,
      status: "COMPLETED",
      rowCount: rows.length,
      createdCount: created.length,
      errorCount: rows.length - created.length,
      resultSummary: { created },
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  redirect(`/assets/import?imported=1`);
}

function parseCsv(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
