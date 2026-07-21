"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { currentUser, requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  alertActionSchema,
  enrolmentFormSchema,
  monitoringPolicyFormSchema,
  networkDeviceFormSchema,
  networkEnvironmentFormSchema,
  networkSearchTokens,
} from "@/lib/network";
import { createSecureToken, hashRestrictedCredential } from "@/lib/network-security";
import { hasPermission } from "@/lib/permissions";

export type EnrolmentActionState = {
  error?: string;
  token?: string;
  enrollmentId?: string;
  expiresAt?: string;
};

function parseList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\n,]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optional(value: string | undefined) {
  return value || null;
}

function errorRedirect(pathname: string, message: string) {
  redirect(`${pathname}?error=${encodeURIComponent(message)}`);
}

async function getIpAddress() {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip");
}

async function validateClientSite(clientId: string, siteId: string) {
  const [client, site] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.clientSite.findUnique({ where: { id: siteId } }),
  ]);
  if (!client || client.workspaceId !== env.DEFAULT_WORKSPACE_ID || client.status === "FORMER") throw new Error("Selected client does not exist.");
  if (!site || site.workspaceId !== env.DEFAULT_WORKSPACE_ID || site.clientId !== client.id) throw new Error("Selected site does not belong to that client.");
  return { client, site };
}

function environmentPayload(formData: FormData) {
  return networkEnvironmentFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    clientId: formData.get("clientId"),
    siteId: formData.get("siteId"),
    networkType: formData.get("networkType"),
    primarySubnet: formData.get("primarySubnet"),
    additionalSubnets: parseList(formData.get("additionalSubnets")),
    publicIpAddress: formData.get("publicIpAddress"),
    defaultGateway: formData.get("defaultGateway"),
    dnsServers: parseList(formData.get("dnsServers")),
    dhcpServer: formData.get("dhcpServer"),
    domainOrWorkgroup: formData.get("domainOrWorkgroup"),
    internetServiceProvider: formData.get("internetServiceProvider"),
    connectionType: formData.get("connectionType"),
    router: formData.get("router"),
    firewall: formData.get("firewall"),
    responsibleTechnicianId: formData.get("responsibleTechnicianId"),
    supportAgreementId: formData.get("supportAgreementId"),
    monitoringState: formData.get("monitoringState"),
    notes: formData.get("notes"),
  });
}

export async function createNetworkEnvironmentAction(formData: FormData) {
  const actor = await requirePermission("networks.create");
  const parsed = environmentPayload(formData);
  if (!parsed.success) errorRedirect("/network/environments/new", parsed.error.issues[0]?.message ?? "Review the environment details.");
  const data = parsed.data!;
  try {
    await validateClientSite(data.clientId, data.siteId);
  } catch (error) {
    errorRedirect("/network/environments/new", error instanceof Error ? error.message : "Invalid client or site.");
  }
  const [technician, agreement] = await Promise.all([
    data.responsibleTechnicianId ? prisma.user.findUnique({ where: { id: data.responsibleTechnicianId } }) : null,
    data.supportAgreementId ? prisma.supportAgreement.findUnique({ where: { id: data.supportAgreementId } }) : null,
  ]);
  if (data.responsibleTechnicianId && (!technician || technician.status !== "ACTIVE")) errorRedirect("/network/environments/new", "Selected technician is not active.");
  if (data.supportAgreementId && (!agreement || agreement.clientId !== data.clientId || agreement.siteId && agreement.siteId !== data.siteId)) errorRedirect("/network/environments/new", "Selected support agreement does not match the client and site.");
  const environment = await prisma.networkEnvironment.create({
    data: {
      workspaceId: env.DEFAULT_WORKSPACE_ID,
      ...data,
      description: optional(data.description),
      primarySubnet: optional(data.primarySubnet),
      publicIpAddress: optional(data.publicIpAddress),
      defaultGateway: optional(data.defaultGateway),
      dhcpServer: optional(data.dhcpServer),
      domainOrWorkgroup: optional(data.domainOrWorkgroup),
      internetServiceProvider: optional(data.internetServiceProvider),
      connectionType: optional(data.connectionType),
      router: optional(data.router),
      firewall: optional(data.firewall),
      responsibleTechnicianId: optional(data.responsibleTechnicianId),
      supportAgreementId: optional(data.supportAgreementId),
      notes: optional(data.notes),
      searchTokens: networkSearchTokens([data.name, data.description, data.primarySubnet, data.publicIpAddress, data.domainOrWorkgroup]),
      lastScan: null,
      lastSuccessfulCheck: null,
      archivedAt: null,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  await logAudit({ userId: actor.id, action: "networks.create", entityType: "NetworkEnvironment", entityId: environment.id, newValues: { clientId: data.clientId, siteId: data.siteId, name: data.name }, ipAddress: await getIpAddress() });
  revalidatePath("/network");
  revalidatePath("/network/environments");
  redirect(`/network/environments/${environment.id}?created=1`);
}

export async function updateNetworkEnvironmentAction(formData: FormData) {
  const actor = await requirePermission("networks.update");
  const environmentId = String(formData.get("environmentId") ?? "");
  const existing = await prisma.networkEnvironment.findUnique({ where: { id: environmentId } });
  if (!existing || existing.workspaceId !== env.DEFAULT_WORKSPACE_ID) errorRedirect("/network/environments", "Network environment not found.");
  const parsed = environmentPayload(formData);
  if (!parsed.success) errorRedirect(`/network/environments/${environmentId}`, parsed.error.issues[0]?.message ?? "Review the environment details.");
  const data = parsed.data!;
  try {
    await validateClientSite(data.clientId, data.siteId);
  } catch (error) {
    errorRedirect(`/network/environments/${environmentId}`, error instanceof Error ? error.message : "Invalid client or site.");
  }
  await prisma.networkEnvironment.update({
    where: { id: environmentId },
    data: {
      ...data,
      description: optional(data.description),
      primarySubnet: optional(data.primarySubnet),
      publicIpAddress: optional(data.publicIpAddress),
      defaultGateway: optional(data.defaultGateway),
      dhcpServer: optional(data.dhcpServer),
      domainOrWorkgroup: optional(data.domainOrWorkgroup),
      internetServiceProvider: optional(data.internetServiceProvider),
      connectionType: optional(data.connectionType),
      router: optional(data.router),
      firewall: optional(data.firewall),
      responsibleTechnicianId: optional(data.responsibleTechnicianId),
      supportAgreementId: optional(data.supportAgreementId),
      notes: optional(data.notes),
      searchTokens: networkSearchTokens([data.name, data.description, data.primarySubnet, data.publicIpAddress, data.domainOrWorkgroup]),
      updatedById: actor.id,
    },
  });
  await logAudit({ userId: actor.id, action: "networks.update", entityType: "NetworkEnvironment", entityId: environmentId, previousValues: { clientId: existing.clientId, siteId: existing.siteId, monitoringState: existing.monitoringState }, newValues: data, ipAddress: await getIpAddress() });
  revalidatePath("/network");
  revalidatePath("/network/environments");
  revalidatePath(`/network/environments/${environmentId}`);
  redirect(`/network/environments/${environmentId}?updated=1`);
}

export async function setNetworkEnvironmentArchiveAction(formData: FormData) {
  const actor = await requirePermission("networks.archive");
  const environmentId = String(formData.get("environmentId") ?? "");
  const restore = formData.get("restore") === "true";
  const existing = await prisma.networkEnvironment.findUnique({ where: { id: environmentId } });
  if (!existing || existing.workspaceId !== env.DEFAULT_WORKSPACE_ID) errorRedirect("/network/environments", "Network environment not found.");
  await prisma.networkEnvironment.update({ where: { id: environmentId }, data: { archivedAt: restore ? null : new Date(), monitoringState: restore ? "PAUSED" : "ARCHIVED", updatedById: actor.id } });
  await logAudit({ userId: actor.id, action: restore ? "networks.restore" : "networks.archive", entityType: "NetworkEnvironment", entityId: environmentId, ipAddress: await getIpAddress() });
  revalidatePath("/network");
  revalidatePath("/network/environments");
  redirect(`/network/environments/${environmentId}?${restore ? "restored" : "archived"}=1`);
}

function devicePayload(formData: FormData) {
  return networkDeviceFormSchema.safeParse({
    networkEnvironmentId: formData.get("networkEnvironmentId"),
    assetId: formData.get("assetId"),
    name: formData.get("name"),
    deviceType: formData.get("deviceType"),
    manufacturer: formData.get("manufacturer"),
    model: formData.get("model"),
    serialNumber: formData.get("serialNumber"),
    hostname: formData.get("hostname"),
    ipAddress: formData.get("ipAddress"),
    macAddress: formData.get("macAddress"),
    vlan: formData.get("vlan"),
    subnet: formData.get("subnet"),
    defaultGateway: formData.get("defaultGateway"),
    dnsInformation: formData.get("dnsInformation"),
    firmwareVersion: formData.get("firmwareVersion"),
    operatingSystem: formData.get("operatingSystem"),
    physicalLocation: formData.get("physicalLocation"),
    rackInformation: formData.get("rackInformation"),
    responsibleTechnicianId: formData.get("responsibleTechnicianId"),
    monitoringState: formData.get("monitoringState"),
    healthState: formData.get("healthState"),
    complianceState: formData.get("complianceState"),
    notes: formData.get("notes"),
  });
}

export async function createNetworkDeviceAction(formData: FormData) {
  const actor = await requirePermission("network_devices.manage");
  const parsed = devicePayload(formData);
  const backPath = `/network/environments/${String(formData.get("networkEnvironmentId") ?? "")}`;
  if (!parsed.success) errorRedirect(backPath, parsed.error.issues[0]?.message ?? "Review the device details.");
  const data = parsed.data!;
  const environment = await prisma.networkEnvironment.findUnique({ where: { id: data.networkEnvironmentId } });
  if (!environment || environment.workspaceId !== env.DEFAULT_WORKSPACE_ID || environment.archivedAt) errorRedirect("/network/environments", "Network environment not found.");
  const asset = data.assetId ? await prisma.asset.findUnique({ where: { id: data.assetId } }) : null;
  if (data.assetId && (!asset || asset.workspaceId !== environment.workspaceId || asset.clientId !== environment.clientId || asset.siteId !== environment.siteId)) errorRedirect(backPath, "The selected asset does not belong to this client and site.");
  if (asset) {
    const existingLink = await prisma.networkDevice.findFirst({ where: { assetId: asset.id } });
    if (existingLink) errorRedirect(backPath, "That asset is already linked to a network device.");
  }
  const device = await prisma.networkDevice.create({
    data: {
      workspaceId: environment.workspaceId,
      clientId: environment.clientId,
      siteId: environment.siteId,
      ...data,
      assetId: optional(data.assetId),
      manufacturer: optional(data.manufacturer),
      model: optional(data.model),
      serialNumber: optional(data.serialNumber),
      hostname: optional(data.hostname),
      ipAddress: optional(data.ipAddress),
      macAddress: optional(data.macAddress),
      vlan: optional(data.vlan),
      subnet: optional(data.subnet),
      defaultGateway: optional(data.defaultGateway),
      dnsInformation: optional(data.dnsInformation),
      firmwareVersion: optional(data.firmwareVersion),
      operatingSystem: optional(data.operatingSystem),
      physicalLocation: optional(data.physicalLocation),
      rackInformation: optional(data.rackInformation),
      responsibleTechnicianId: optional(data.responsibleTechnicianId),
      notes: optional(data.notes),
      firstDetected: new Date(),
      lastDetected: new Date(),
      lastCheckIn: null,
      lastSuccessfulCheck: null,
      archivedAt: null,
      searchTokens: networkSearchTokens([data.name, data.hostname, data.ipAddress, data.macAddress, data.serialNumber, data.manufacturer, data.model]),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  await logAudit({ userId: actor.id, action: "network_devices.create", entityType: "NetworkDevice", entityId: device.id, newValues: { environmentId: environment.id, assetId: asset?.id ?? null, clientId: environment.clientId, siteId: environment.siteId }, ipAddress: await getIpAddress() });
  revalidatePath("/network");
  revalidatePath(backPath);
  redirect(`${backPath}?deviceCreated=1`);
}

export async function updateNetworkDeviceAction(formData: FormData) {
  const actor = await requirePermission("network_devices.manage");
  const deviceId = String(formData.get("deviceId") ?? "");
  const parsed = devicePayload(formData);
  if (!parsed.success) errorRedirect(`/network/devices/${deviceId}`, parsed.error.issues[0]?.message ?? "Review the device details.");
  const data = parsed.data!;
  const existing = await prisma.networkDevice.findUnique({ where: { id: deviceId } });
  const environment = await prisma.networkEnvironment.findUnique({ where: { id: data.networkEnvironmentId } });
  if (!existing || existing.workspaceId !== env.DEFAULT_WORKSPACE_ID || !environment || environment.workspaceId !== env.DEFAULT_WORKSPACE_ID) errorRedirect("/network/environments", "Network device or environment not found.");
  const asset = data.assetId ? await prisma.asset.findUnique({ where: { id: data.assetId } }) : null;
  if (data.assetId && (!asset || asset.workspaceId !== environment.workspaceId || asset.clientId !== environment.clientId || asset.siteId !== environment.siteId)) errorRedirect(`/network/devices/${deviceId}`, "The selected asset does not belong to this client and site.");
  if (asset && asset.id !== existing.assetId) {
    const existingLink = await prisma.networkDevice.findFirst({ where: { assetId: asset.id } });
    if (existingLink && existingLink.id !== deviceId) errorRedirect(`/network/devices/${deviceId}`, "That asset is already linked to another network device.");
  }
  await prisma.networkDevice.update({ where: { id: deviceId }, data: { ...data, workspaceId: environment.workspaceId, clientId: environment.clientId, siteId: environment.siteId, assetId: optional(data.assetId), manufacturer: optional(data.manufacturer), model: optional(data.model), serialNumber: optional(data.serialNumber), hostname: optional(data.hostname), ipAddress: optional(data.ipAddress), macAddress: optional(data.macAddress), vlan: optional(data.vlan), subnet: optional(data.subnet), defaultGateway: optional(data.defaultGateway), dnsInformation: optional(data.dnsInformation), firmwareVersion: optional(data.firmwareVersion), operatingSystem: optional(data.operatingSystem), physicalLocation: optional(data.physicalLocation), rackInformation: optional(data.rackInformation), responsibleTechnicianId: optional(data.responsibleTechnicianId), notes: optional(data.notes), searchTokens: networkSearchTokens([data.name, data.hostname, data.ipAddress, data.macAddress, data.serialNumber, data.manufacturer, data.model]), updatedById: actor.id } });
  await logAudit({ userId: actor.id, action: "network_devices.update", entityType: "NetworkDevice", entityId: deviceId, previousValues: { name: existing.name, ipAddress: existing.ipAddress, assetId: existing.assetId }, newValues: { name: data.name, ipAddress: data.ipAddress, assetId: data.assetId || null }, ipAddress: await getIpAddress() });
  revalidatePath(`/network/devices/${deviceId}`);
  revalidatePath(`/network/environments/${environment.id}`);
  redirect(`/network/devices/${deviceId}?updated=1`);
}

export async function createEndpointEnrollmentAction(_previous: EnrolmentActionState, formData: FormData): Promise<EnrolmentActionState> {
  const actor = await currentUser();
  if (!actor || !hasPermission(actor, "endpoints.enrol")) return { error: "You do not have permission to create enrolment tokens." };
  const parsed = enrolmentFormSchema.safeParse({
    clientId: formData.get("clientId"),
    siteId: formData.get("siteId"),
    assetId: formData.get("assetId"),
    networkEnvironmentId: formData.get("networkEnvironmentId"),
    expiresInMinutes: formData.get("expiresInMinutes"),
    maxUses: formData.get("maxUses"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Review the enrolment details." };
  const data = parsed.data;
  try {
    await validateClientSite(data.clientId, data.siteId);
    const [asset, environment] = await Promise.all([
      data.assetId ? prisma.asset.findUnique({ where: { id: data.assetId } }) : null,
      data.networkEnvironmentId ? prisma.networkEnvironment.findUnique({ where: { id: data.networkEnvironmentId } }) : null,
    ]);
    if (data.assetId && (!asset || asset.workspaceId !== env.DEFAULT_WORKSPACE_ID || asset.clientId !== data.clientId || asset.siteId !== data.siteId)) return { error: "The selected asset does not belong to this client and site." };
    if (data.networkEnvironmentId && (!environment || environment.workspaceId !== env.DEFAULT_WORKSPACE_ID || environment.clientId !== data.clientId || environment.siteId !== data.siteId)) return { error: "The selected network environment does not belong to this client and site." };
    const token = createSecureToken(32);
    const expiresAt = new Date(Date.now() + data.expiresInMinutes * 60_000);
    const enrollment = await prisma.endpointEnrollment.create({
      data: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        clientId: data.clientId,
        siteId: data.siteId,
        assetId: optional(data.assetId),
        networkEnvironmentId: optional(data.networkEnvironmentId),
        tokenHash: hashRestrictedCredential(token, env.ENDPOINT_CREDENTIAL_PEPPER),
        tokenHint: token.slice(-6),
        expiresAt,
        maxUses: data.maxUses,
        useCount: 0,
        revokedAt: null,
        lastUsedAt: null,
        notes: optional(data.notes),
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await logAudit({ userId: actor.id, action: "endpoints.enrol.create", entityType: "EndpointEnrollment", entityId: enrollment.id, newValues: { clientId: data.clientId, siteId: data.siteId, assetId: data.assetId || null, expiresAt, maxUses: data.maxUses }, ipAddress: await getIpAddress() });
    revalidatePath("/network/enrolments");
    return { token, enrollmentId: enrollment.id, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The enrolment token could not be created." };
  }
}

export async function revokeEndpointEnrollmentAction(formData: FormData) {
  const actor = await requirePermission("endpoints.enrol");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const enrollment = await prisma.endpointEnrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.workspaceId !== env.DEFAULT_WORKSPACE_ID) errorRedirect("/network/enrolments", "Enrolment not found.");
  await prisma.endpointEnrollment.update({ where: { id: enrollmentId }, data: { revokedAt: new Date(), updatedById: actor.id } });
  await logAudit({ userId: actor.id, action: "endpoints.enrol.revoke", entityType: "EndpointEnrollment", entityId: enrollmentId, ipAddress: await getIpAddress() });
  revalidatePath("/network/enrolments");
  redirect("/network/enrolments?revoked=1");
}

export async function revokeEndpointAction(formData: FormData) {
  const actor = await requirePermission("endpoints.revoke");
  const endpointId = String(formData.get("endpointId") ?? "");
  const endpoint = await prisma.endpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint || endpoint.workspaceId !== env.DEFAULT_WORKSPACE_ID) errorRedirect("/network/endpoints", "Endpoint not found.");
  await Promise.all([
    prisma.endpoint.update({ where: { id: endpointId }, data: { revokedAt: new Date(), monitoringState: "ARCHIVED", checkInState: "REVOKED", updatedById: actor.id } }),
    prisma.endpointCredential.updateMany({ where: { endpointId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } }),
  ]);
  await logAudit({ userId: actor.id, action: "endpoints.revoke", entityType: "Endpoint", entityId: endpointId, ipAddress: await getIpAddress() });
  revalidatePath("/network");
  revalidatePath("/network/endpoints");
  redirect(`/network/endpoints/${endpointId}?revoked=1`);
}

export async function linkEndpointAssetAction(formData: FormData) {
  const actor = await requirePermission("endpoints.audit");
  const endpointId = String(formData.get("endpointId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  const [endpoint, asset] = await Promise.all([
    prisma.endpoint.findUnique({ where: { id: endpointId } }),
    prisma.asset.findUnique({ where: { id: assetId } }),
  ]);
  if (!endpoint || endpoint.workspaceId !== env.DEFAULT_WORKSPACE_ID) errorRedirect("/network/endpoints", "Endpoint not found.");
  if (!asset || asset.workspaceId !== endpoint.workspaceId || asset.clientId !== endpoint.clientId || asset.siteId !== endpoint.siteId) errorRedirect(`/network/endpoints/${endpointId}`, "Asset must belong to the same workspace, client, and site.");
  const previousAssetId = endpoint.assetId ?? null;
  await prisma.endpoint.update({ where: { id: endpointId }, data: { assetId: asset.id, matchState: "MANUALLY_LINKED", matchCandidates: [], updatedById: actor.id } });
  await logAudit({ userId: actor.id, action: "endpoints.asset.link", entityType: "Endpoint", entityId: endpointId, previousValues: { assetId: previousAssetId }, newValues: { assetId: asset.id }, ipAddress: await getIpAddress() });
  revalidatePath(`/network/endpoints/${endpointId}`);
  redirect(`/network/endpoints/${endpointId}?linked=1`);
}

export async function requestEndpointAuditAction(formData: FormData) {
  const actor = await requirePermission("endpoints.audit");
  const endpointId = String(formData.get("endpointId") ?? "");
  const endpoint = await prisma.endpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint || endpoint.workspaceId !== env.DEFAULT_WORKSPACE_ID || endpoint.revokedAt) errorRedirect("/network/endpoints", "Endpoint not found or inactive.");
  await prisma.endpointCommand.create({
    data: {
      workspaceId: endpoint.workspaceId,
      clientId: endpoint.clientId,
      siteId: endpoint.siteId,
      endpointId,
      commandType: "RUN_AUDIT",
      parameters: {},
      status: "PENDING",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      requestedById: actor.id,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  await logAudit({ userId: actor.id, action: "endpoints.audit.request", entityType: "Endpoint", entityId: endpointId, metadata: { commandType: "RUN_AUDIT" }, ipAddress: await getIpAddress() });
  revalidatePath(`/network/endpoints/${endpointId}`);
  redirect(`/network/endpoints/${endpointId}?auditRequested=1`);
}

export async function createMonitoringPolicyAction(formData: FormData) {
  const actor = await requirePermission("monitoring_policies.manage");
  const parsed = monitoringPolicyFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    scopeType: formData.get("scopeType"),
    clientId: formData.get("clientId"),
    siteId: formData.get("siteId"),
    assetId: formData.get("assetId"),
    checkInFrequencyMinutes: formData.get("checkInFrequencyMinutes"),
    offlineThresholdMinutes: formData.get("offlineThresholdMinutes"),
    auditOverdueMinutes: formData.get("auditOverdueMinutes"),
    lowDiskWarningPercent: formData.get("lowDiskWarningPercent"),
    criticalDiskPercent: formData.get("criticalDiskPercent"),
    requireAntivirus: formData.get("requireAntivirus") === "true",
    requireFirewall: formData.get("requireFirewall") === "true",
    requireEncryption: formData.get("requireEncryption") === "true",
    requireSecureBoot: formData.get("requireSecureBoot") === "true",
    requireTpm: formData.get("requireTpm") === "true",
    supportedWindowsBuilds: parseList(formData.get("supportedWindowsBuilds")),
    automaticTicketAlertTypes: parseList(formData.get("automaticTicketAlertTypes")),
    notificationUserIds: formData.getAll("notificationUserIds").map(String).filter(Boolean),
    active: formData.get("active") === "true",
  });
  if (!parsed.success) errorRedirect("/network/policies", parsed.error.issues[0]?.message ?? "Review the policy details.");
  const data = parsed.data!;
  if (data.criticalDiskPercent <= data.lowDiskWarningPercent) errorRedirect("/network/policies", "Critical disk percentage must be higher than the warning percentage.");
  if (data.scopeType !== "WORKSPACE") {
    if (data.scopeType === "CLIENT" && !data.clientId) errorRedirect("/network/policies", "Choose a client for this policy.");
    if (data.scopeType === "SITE" && (!data.clientId || !data.siteId)) errorRedirect("/network/policies", "Choose a client and site for this policy.");
    if (data.scopeType === "ASSET" && !data.assetId) errorRedirect("/network/policies", "Choose an asset for this policy.");
  }
  if (data.clientId && data.siteId) {
    try { await validateClientSite(data.clientId, data.siteId); } catch (error) { errorRedirect("/network/policies", error instanceof Error ? error.message : "Invalid policy scope."); }
  }
  const policy = await prisma.monitoringPolicy.create({
    data: {
      workspaceId: env.DEFAULT_WORKSPACE_ID,
      ...data,
      description: optional(data.description),
      clientId: optional(data.clientId),
      siteId: optional(data.siteId),
      assetId: optional(data.assetId),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  await logAudit({ userId: actor.id, action: "monitoring_policies.create", entityType: "MonitoringPolicy", entityId: policy.id, newValues: { name: data.name, scopeType: data.scopeType, clientId: data.clientId || null, siteId: data.siteId || null, assetId: data.assetId || null }, ipAddress: await getIpAddress() });
  revalidatePath("/network/policies");
  redirect("/network/policies?created=1");
}

async function createAlertTicket(alert: any, endpoint: any, actor: any) {
  if (alert.relatedTicketId) return alert.relatedTicketId;
  const sequence = await prisma.ticketSequence.upsert({ where: { name: "default" }, create: { name: "default", currentValue: 1 }, update: { currentValue: { increment: 1 } } });
  const referenceNumber = `SH-TKT-${String(sequence.currentValue).padStart(6, "0")}`;
  const ticket = await prisma.ticket.create({
    data: {
      workspaceId: alert.workspaceId,
      referenceNumber,
      subject: `[Network] ${String(alert.type).replace(/_/g, " ")} - ${endpoint?.computerName ?? "Managed device"}`,
      description: `${alert.description}\n\nCreated from SourceHub network alert ${alert.id}.`,
      status: "NEW",
      priority: alert.severity === "CRITICAL" ? "URGENT" : alert.severity === "HIGH" ? "HIGH" : "NORMAL",
      categoryId: null,
      clientId: alert.clientId,
      siteId: alert.siteId,
      assetId: alert.assetId ?? null,
      endpointId: alert.endpointId ?? null,
      networkAlertId: alert.id,
      requesterId: actor.id,
      assigneeId: alert.assignedTechnicianId ?? endpoint?.responsibleTechnicianId ?? null,
      openedAt: new Date(),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  await prisma.networkAlert.update({ where: { id: alert.id }, data: { relatedTicketId: ticket.id, updatedById: actor.id } });
  return ticket.id;
}

export async function updateNetworkAlertAction(formData: FormData) {
  const actor = await requirePermission("network_alerts.manage");
  const parsed = alertActionSchema.safeParse({ alertId: formData.get("alertId"), action: formData.get("action"), assignedTechnicianId: formData.get("assignedTechnicianId"), reason: formData.get("reason") });
  if (!parsed.success) errorRedirect("/network/alerts", parsed.error.issues[0]?.message ?? "Review the alert action.");
  const data = parsed.data!;
  const alert = await prisma.networkAlert.findUnique({ where: { id: data.alertId } });
  if (!alert || alert.workspaceId !== env.DEFAULT_WORKSPACE_ID) errorRedirect("/network/alerts", "Alert not found.");
  if (data.action === "SUPPRESS" && !hasPermission(actor, "network_alerts.suppress")) redirect("/access-denied");
  if (data.action === "SUPPRESS" && !data.reason) errorRedirect("/network/alerts", "A suppression reason is required.");
  const endpoint = alert.endpointId ? await prisma.endpoint.findUnique({ where: { id: alert.endpointId } }) : null;
  let relatedTicketId = alert.relatedTicketId ?? null;
  if (data.action === "CREATE_TICKET") relatedTicketId = await createAlertTicket(alert, endpoint, actor);
  const statusByAction: Record<string, string> = { ACKNOWLEDGE: "ACKNOWLEDGED", INVESTIGATE: "INVESTIGATING", RESOLVE: "RESOLVED", CLOSE: "CLOSED", SUPPRESS: "SUPPRESSED" };
  const now = new Date();
  const updateData: Record<string, any> = { updatedById: actor.id };
  if (statusByAction[data.action]) updateData.status = statusByAction[data.action];
  if (data.action === "ACKNOWLEDGE") { updateData.acknowledgedById = actor.id; updateData.acknowledgedAt = now; }
  if (["RESOLVE", "CLOSE"].includes(data.action)) { updateData.resolvedById = actor.id; updateData.resolvedAt = now; }
  if (data.action === "SUPPRESS") { updateData.suppressionState = true; updateData.suppressionReason = data.reason; }
  if (data.action === "ASSIGN") updateData.assignedTechnicianId = optional(data.assignedTechnicianId);
  if (relatedTicketId) updateData.relatedTicketId = relatedTicketId;
  await prisma.networkAlert.update({ where: { id: alert.id }, data: updateData });
  await prisma.networkAlertEvent.create({ data: { workspaceId: alert.workspaceId, alertId: alert.id, endpointId: alert.endpointId ?? null, action: data.action, reason: optional(data.reason), actorId: actor.id } });
  await logAudit({ userId: actor.id, action: `network_alerts.${data.action.toLowerCase()}`, entityType: "NetworkAlert", entityId: alert.id, previousValues: { status: alert.status, assignedTechnicianId: alert.assignedTechnicianId ?? null }, newValues: updateData, ipAddress: await getIpAddress() });
  revalidatePath("/network");
  revalidatePath("/network/alerts");
  if (endpoint) revalidatePath(`/network/endpoints/${endpoint.id}`);
  redirect(`/network/alerts?updated=1${relatedTicketId ? `&ticketId=${relatedTicketId}` : ""}`);
}

export async function createNetworkSavedViewAction(formData: FormData) {
  const actor = await requirePermission("endpoints.view");
  const name = String(formData.get("name") ?? "").trim();
  const filters = String(formData.get("filters") ?? "").trim();
  if (!name || name.length > 120) errorRedirect("/network/endpoints", "Enter a valid saved-view name.");
  await prisma.networkSavedView.create({ data: { workspaceId: env.DEFAULT_WORKSPACE_ID, userId: actor.id, name, filtersHash: createHash("sha256").update(filters).digest("hex"), filters, createdById: actor.id, updatedById: actor.id } });
  revalidatePath("/network/endpoints");
  redirect("/network/endpoints?saved=1");
}
