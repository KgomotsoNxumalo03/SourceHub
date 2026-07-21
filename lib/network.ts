import { z } from "zod";

export const NETWORK_SCHEMA_VERSION = "1.0";
export const MIN_AUDIT_SCRIPT_VERSION = "1.0.0";
export const MAX_AUDIT_BYTES = 4 * 1024 * 1024;
export const SIGNATURE_CLOCK_SKEW_SECONDS = 300;
export const AUDIT_RETENTION_DAYS = 90;
export const INGESTION_LOG_RETENTION_DAYS = 30;

export const networkTypeLabels = {
  OFFICE_LAN: "Office LAN",
  DATA_CENTRE: "Data centre",
  CLOUD_NETWORK: "Cloud network",
  HOME_OFFICE: "Home office",
  BRANCH_NETWORK: "Branch network",
  GUEST_NETWORK: "Guest network",
  WIRELESS_NETWORK: "Wireless network",
  VPN_NETWORK: "VPN network",
  OTHER: "Other",
} as const;

export const networkDeviceTypeLabels = {
  ROUTER: "Router",
  FIREWALL: "Firewall",
  SWITCH: "Switch",
  WIRELESS_ACCESS_POINT: "Wireless access point",
  SERVER: "Server",
  NAS: "NAS",
  PRINTER: "Printer",
  VOIP_DEVICE: "VoIP device",
  UPS: "UPS",
  CAMERA: "Camera",
  ACCESS_CONTROL: "Access-control device",
  IOT_DEVICE: "IoT device",
  UNKNOWN: "Unknown device",
  OTHER: "Other",
} as const;

export const monitoringStateLabels = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  NOT_MONITORED: "Not monitored",
  OFFLINE: "Offline",
  ARCHIVED: "Archived",
} as const;

export const endpointHealthLabels = {
  HEALTHY: "Healthy",
  AT_RISK: "At risk",
  CRITICAL: "Critical",
  OFFLINE: "Offline",
  UNKNOWN: "Unknown",
} as const;

export const endpointComplianceLabels = {
  COMPLIANT: "Compliant",
  AT_RISK: "At risk",
  NON_COMPLIANT: "Non-compliant",
  UNKNOWN: "Unknown",
} as const;

export const alertStatusLabels = {
  NEW: "New",
  ACKNOWLEDGED: "Acknowledged",
  INVESTIGATING: "Investigating",
  SUPPRESSED: "Suppressed",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
} as const;

export const alertSeverityLabels = {
  INFO: "Info",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
} as const;

export const endpointFieldOwnership = {
  auditAuthoritative: [
    "computerName",
    "loggedInUser",
    "manufacturer",
    "model",
    "serialNumber",
    "deviceIdentifier",
    "operatingSystem",
    "windowsVersion",
    "buildNumber",
    "architecture",
    "cpuModel",
    "physicalCores",
    "logicalProcessors",
    "totalRamBytes",
    "lastBootTime",
    "networkAdapters",
    "storage",
    "security",
    "software",
  ],
  technicianAuthoritative: [
    "workspaceId",
    "clientId",
    "siteId",
    "assetId",
    "networkEnvironmentId",
    "responsibleTechnicianId",
    "monitoringPolicyId",
    "notes",
  ],
  calculated: ["healthState", "complianceState", "checkInState", "activeAlertCount"],
  historicalOnly: ["auditId", "auditTimestamp", "changes", "rawAuditHash"],
} as const;

const nullableText = z.string().trim().max(500).nullable().optional();
const nullableDateText = z.string().datetime({ offset: true }).nullable().optional();

export const auditErrorSchema = z.object({
  check: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  requiresAdmin: z.boolean().default(false),
});

export const auditStorageSchema = z.object({
  driveLetter: z.string().trim().max(20),
  driveType: nullableText,
  fileSystem: nullableText,
  totalBytes: z.number().nonnegative().nullable().optional(),
  freeBytes: z.number().nonnegative().nullable().optional(),
  usedPercent: z.number().min(0).max(100).nullable().optional(),
  health: nullableText,
  bitLockerState: nullableText,
});

export const auditNetworkAdapterSchema = z.object({
  name: z.string().trim().min(1).max(240),
  connectionType: nullableText,
  ipAddresses: z.array(z.string().trim().max(80)).max(32).default([]),
  subnetPrefixes: z.array(z.string().trim().max(80)).max(32).default([]),
  defaultGateways: z.array(z.string().trim().max(80)).max(16).default([]),
  dnsServers: z.array(z.string().trim().max(80)).max(16).default([]),
  dhcpEnabled: z.boolean().nullable().optional(),
  macAddress: nullableText,
  linkSpeed: nullableText,
});

export const auditSoftwareSchema = z.object({
  name: z.string().trim().min(1).max(300),
  publisher: nullableText,
  version: nullableText,
  installDate: nullableText,
});

export const endpointAuditSchema = z.object({
  schemaVersion: z.literal(NETWORK_SCHEMA_VERSION),
  scriptVersion: z.string().trim().min(1).max(40),
  auditId: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
  device: z.object({
    computerName: z.string().trim().min(1).max(255),
    loggedInUser: nullableText,
    manufacturer: nullableText,
    model: nullableText,
    serialNumber: nullableText,
    windowsDeviceId: nullableText,
    domainOrWorkgroup: nullableText,
    deviceType: nullableText,
  }),
  operatingSystem: z.object({
    edition: nullableText,
    version: nullableText,
    buildNumber: nullableText,
    architecture: nullableText,
    installationDate: nullableDateText,
    lastBootTime: nullableDateText,
    uptimeSeconds: z.number().nonnegative().nullable().optional(),
    timeZone: nullableText,
  }),
  hardware: z.object({
    cpuManufacturer: nullableText,
    cpuModel: nullableText,
    physicalCores: z.number().int().nonnegative().nullable().optional(),
    logicalProcessors: z.number().int().nonnegative().nullable().optional(),
    totalRamBytes: z.number().nonnegative().nullable().optional(),
    availableRamBytes: z.number().nonnegative().nullable().optional(),
    memoryModules: z.array(z.object({ capacityBytes: z.number().nonnegative().nullable().optional(), manufacturer: nullableText, partNumber: nullableText })).max(64).default([]),
  }),
  storage: z.array(auditStorageSchema).max(128).default([]),
  network: z.object({
    adapters: z.array(auditNetworkAdapterSchema).max(64).default([]),
    publicIp: nullableText,
  }),
  security: z.object({
    antivirusProduct: nullableText,
    antivirusEnabled: z.boolean().nullable().optional(),
    antivirusUpToDate: z.boolean().nullable().optional(),
    firewallEnabled: z.boolean().nullable().optional(),
    bitLockerEnabled: z.boolean().nullable().optional(),
    secureBootEnabled: z.boolean().nullable().optional(),
    tpmPresent: z.boolean().nullable().optional(),
    tpmReady: z.boolean().nullable().optional(),
    pendingRestart: z.boolean().nullable().optional(),
    windowsUpdateState: nullableText,
    localAdministrators: z.array(z.string().trim().max(255)).max(100).default([]),
  }),
  software: z.array(auditSoftwareSchema).max(10000).default([]),
  checkErrors: z.array(auditErrorSchema).max(256).default([]),
});

export type EndpointAudit = z.infer<typeof endpointAuditSchema>;

export const networkEnvironmentFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  clientId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  networkType: z.enum(Object.keys(networkTypeLabels) as [keyof typeof networkTypeLabels, ...(keyof typeof networkTypeLabels)[]]),
  primarySubnet: z.string().trim().max(80).optional().or(z.literal("")),
  additionalSubnets: z.array(z.string().trim().min(1).max(80)).max(64).default([]),
  publicIpAddress: z.string().trim().max(80).optional().or(z.literal("")),
  defaultGateway: z.string().trim().max(80).optional().or(z.literal("")),
  dnsServers: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  dhcpServer: z.string().trim().max(255).optional().or(z.literal("")),
  domainOrWorkgroup: z.string().trim().max(255).optional().or(z.literal("")),
  internetServiceProvider: z.string().trim().max(255).optional().or(z.literal("")),
  connectionType: z.string().trim().max(120).optional().or(z.literal("")),
  router: z.string().trim().max(255).optional().or(z.literal("")),
  firewall: z.string().trim().max(255).optional().or(z.literal("")),
  responsibleTechnicianId: z.string().trim().optional().or(z.literal("")),
  supportAgreementId: z.string().trim().optional().or(z.literal("")),
  monitoringState: z.enum(["ACTIVE", "PAUSED", "NOT_MONITORED", "OFFLINE", "ARCHIVED"]),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const networkDeviceFormSchema = z.object({
  networkEnvironmentId: z.string().trim().min(1),
  assetId: z.string().trim().optional().or(z.literal("")),
  name: z.string().trim().min(1).max(160),
  deviceType: z.enum(Object.keys(networkDeviceTypeLabels) as [keyof typeof networkDeviceTypeLabels, ...(keyof typeof networkDeviceTypeLabels)[]]),
  manufacturer: z.string().trim().max(160).optional().or(z.literal("")),
  model: z.string().trim().max(160).optional().or(z.literal("")),
  serialNumber: z.string().trim().max(255).optional().or(z.literal("")),
  hostname: z.string().trim().max(255).optional().or(z.literal("")),
  ipAddress: z.string().trim().max(80).optional().or(z.literal("")),
  macAddress: z.string().trim().max(80).optional().or(z.literal("")),
  vlan: z.string().trim().max(80).optional().or(z.literal("")),
  subnet: z.string().trim().max(80).optional().or(z.literal("")),
  defaultGateway: z.string().trim().max(80).optional().or(z.literal("")),
  dnsInformation: z.string().trim().max(500).optional().or(z.literal("")),
  firmwareVersion: z.string().trim().max(160).optional().or(z.literal("")),
  operatingSystem: z.string().trim().max(255).optional().or(z.literal("")),
  physicalLocation: z.string().trim().max(255).optional().or(z.literal("")),
  rackInformation: z.string().trim().max(255).optional().or(z.literal("")),
  responsibleTechnicianId: z.string().trim().optional().or(z.literal("")),
  monitoringState: z.enum(["ACTIVE", "PAUSED", "NOT_MONITORED", "OFFLINE", "ARCHIVED"]),
  healthState: z.enum(["HEALTHY", "AT_RISK", "CRITICAL", "OFFLINE", "UNKNOWN"]),
  complianceState: z.enum(["COMPLIANT", "AT_RISK", "NON_COMPLIANT", "UNKNOWN"]),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const monitoringPolicyFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  scopeType: z.enum(["WORKSPACE", "CLIENT", "SITE", "ASSET"]),
  clientId: z.string().trim().optional().or(z.literal("")),
  siteId: z.string().trim().optional().or(z.literal("")),
  assetId: z.string().trim().optional().or(z.literal("")),
  checkInFrequencyMinutes: z.coerce.number().int().min(5).max(43200),
  offlineThresholdMinutes: z.coerce.number().int().min(15).max(129600),
  auditOverdueMinutes: z.coerce.number().int().min(15).max(129600),
  lowDiskWarningPercent: z.coerce.number().min(1).max(99),
  criticalDiskPercent: z.coerce.number().min(1).max(99),
  requireAntivirus: z.coerce.boolean(),
  requireFirewall: z.coerce.boolean(),
  requireEncryption: z.coerce.boolean(),
  requireSecureBoot: z.coerce.boolean(),
  requireTpm: z.coerce.boolean(),
  supportedWindowsBuilds: z.array(z.string().trim().min(1).max(40)).max(100).default([]),
  automaticTicketAlertTypes: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  notificationUserIds: z.array(z.string().trim().min(1)).max(100).default([]),
  active: z.coerce.boolean(),
});

export const enrolmentFormSchema = z.object({
  clientId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  assetId: z.string().trim().optional().or(z.literal("")),
  networkEnvironmentId: z.string().trim().optional().or(z.literal("")),
  expiresInMinutes: z.coerce.number().int().min(5).max(1440),
  maxUses: z.coerce.number().int().min(1).max(100),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const alertActionSchema = z.object({
  alertId: z.string().trim().min(1),
  action: z.enum(["ACKNOWLEDGE", "INVESTIGATE", "RESOLVE", "CLOSE", "SUPPRESS", "ASSIGN", "CREATE_TICKET"]),
  assignedTechnicianId: z.string().trim().optional().or(z.literal("")),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type MonitoringPolicyLike = {
  id?: string;
  checkInFrequencyMinutes: number;
  offlineThresholdMinutes: number;
  auditOverdueMinutes: number;
  lowDiskWarningPercent: number;
  criticalDiskPercent: number;
  requireAntivirus: boolean;
  requireFirewall: boolean;
  requireEncryption: boolean;
  requireSecureBoot: boolean;
  requireTpm: boolean;
  supportedWindowsBuilds?: string[];
  automaticTicketAlertTypes?: string[];
};

export const defaultMonitoringPolicy: MonitoringPolicyLike = {
  id: "workspace-default",
  checkInFrequencyMinutes: 1440,
  offlineThresholdMinutes: 2880,
  auditOverdueMinutes: 4320,
  lowDiskWarningPercent: 80,
  criticalDiskPercent: 92,
  requireAntivirus: true,
  requireFirewall: true,
  requireEncryption: true,
  requireSecureBoot: false,
  requireTpm: false,
  supportedWindowsBuilds: [],
  automaticTicketAlertTypes: ["CRITICAL_DISK_SPACE", "ANTIVIRUS_DISABLED"],
};

export function normalizeNetworkValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeMacAddress(value: unknown) {
  const compact = normalizeNetworkValue(value).replace(/[^a-f0-9]/g, "").toUpperCase();
  return compact.length === 12 ? compact.match(/.{2}/g)?.join(":") ?? compact : compact;
}

export function networkSearchTokens(values: unknown[]) {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const token of normalizeNetworkValue(value).split(/[^a-z0-9@._:-]+/g)) {
      if (token.length >= 2) tokens.add(token);
    }
  }
  return Array.from(tokens).slice(0, 200);
}

export function resolveMonitoringPolicy<T extends { id: string; scopeType: string; clientId?: string | null; siteId?: string | null; assetId?: string | null; active: boolean }>(
  policies: T[],
  scope: { clientId?: string | null; siteId?: string | null; assetId?: string | null },
) {
  const precedence = { WORKSPACE: 1, CLIENT: 2, SITE: 3, ASSET: 4 } as const;
  return policies
    .filter((policy) => policy.active)
    .filter((policy) => {
      if (policy.scopeType === "WORKSPACE") return true;
      if (policy.scopeType === "CLIENT") return Boolean(scope.clientId && policy.clientId === scope.clientId);
      if (policy.scopeType === "SITE") return Boolean(scope.siteId && policy.siteId === scope.siteId);
      if (policy.scopeType === "ASSET") return Boolean(scope.assetId && policy.assetId === scope.assetId);
      return false;
    })
    .sort((left, right) => (precedence[right.scopeType as keyof typeof precedence] ?? 0) - (precedence[left.scopeType as keyof typeof precedence] ?? 0))[0] ?? null;
}

export function calculateEndpointPosture(audit: EndpointAudit, policy: MonitoringPolicyLike = defaultMonitoringPolicy) {
  const usedPercent = audit.storage.reduce((maximum, drive) => Math.max(maximum, drive.usedPercent ?? 0), 0);
  const securityFailures: string[] = [];
  if (policy.requireAntivirus && audit.security.antivirusEnabled !== true) securityFailures.push("ANTIVIRUS_DISABLED");
  if (policy.requireFirewall && audit.security.firewallEnabled !== true) securityFailures.push("FIREWALL_DISABLED");
  if (policy.requireEncryption && audit.security.bitLockerEnabled !== true) securityFailures.push("BITLOCKER_DISABLED");
  if (policy.requireSecureBoot && audit.security.secureBootEnabled !== true) securityFailures.push("SECURE_BOOT_DISABLED");
  if (policy.requireTpm && audit.security.tpmReady !== true) securityFailures.push("TPM_NOT_READY");
  if (policy.supportedWindowsBuilds?.length && !policy.supportedWindowsBuilds.includes(audit.operatingSystem.buildNumber ?? "")) {
    securityFailures.push("UNSUPPORTED_WINDOWS_VERSION");
  }
  if (audit.security.pendingRestart) securityFailures.push("PENDING_RESTART");

  const diskState = usedPercent >= policy.criticalDiskPercent ? "CRITICAL" : usedPercent >= policy.lowDiskWarningPercent ? "WARNING" : "HEALTHY";
  const healthState = diskState === "CRITICAL" || securityFailures.includes("ANTIVIRUS_DISABLED") || securityFailures.includes("FIREWALL_DISABLED")
    ? "CRITICAL"
    : diskState === "WARNING" || securityFailures.length > 0
      ? "AT_RISK"
      : "HEALTHY";
  const complianceState = securityFailures.some((failure) => ["ANTIVIRUS_DISABLED", "FIREWALL_DISABLED", "BITLOCKER_DISABLED", "UNSUPPORTED_WINDOWS_VERSION"].includes(failure))
    ? "NON_COMPLIANT"
    : securityFailures.length > 0
      ? "AT_RISK"
      : "COMPLIANT";

  return { healthState, complianceState, diskState, maximumDiskUsedPercent: usedPercent, failures: securityFailures };
}

export type EndpointChange = {
  changeType: string;
  previousValue: unknown;
  newValue: unknown;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

function addChange(changes: EndpointChange[], changeType: string, previousValue: unknown, newValue: unknown, severity: EndpointChange["severity"]) {
  if (JSON.stringify(previousValue ?? null) !== JSON.stringify(newValue ?? null)) changes.push({ changeType, previousValue: previousValue ?? null, newValue: newValue ?? null, severity });
}

export function detectEndpointChanges(previous: EndpointAudit | null, current: EndpointAudit): EndpointChange[] {
  if (!previous) return [];
  const changes: EndpointChange[] = [];
  addChange(changes, "COMPUTER_RENAMED", previous.device.computerName, current.device.computerName, "MEDIUM");
  addChange(changes, "LOGGED_IN_USER_CHANGED", previous.device.loggedInUser, current.device.loggedInUser, "INFO");
  addChange(changes, "WINDOWS_VERSION_CHANGED", `${previous.operatingSystem.version ?? ""}:${previous.operatingSystem.buildNumber ?? ""}`, `${current.operatingSystem.version ?? ""}:${current.operatingSystem.buildNumber ?? ""}`, "MEDIUM");
  addChange(changes, "RAM_CHANGED", previous.hardware.totalRamBytes, current.hardware.totalRamBytes, "MEDIUM");
  addChange(changes, "STORAGE_CHANGED", previous.storage.map((drive) => [drive.driveLetter, drive.totalBytes]), current.storage.map((drive) => [drive.driveLetter, drive.totalBytes]), "MEDIUM");
  addChange(changes, "IP_ADDRESS_CHANGED", previous.network.adapters.flatMap((adapter) => adapter.ipAddresses).sort(), current.network.adapters.flatMap((adapter) => adapter.ipAddresses).sort(), "LOW");
  addChange(changes, "ANTIVIRUS_STATE_CHANGED", previous.security.antivirusEnabled, current.security.antivirusEnabled, current.security.antivirusEnabled === false ? "CRITICAL" : "INFO");
  addChange(changes, "ANTIVIRUS_PRODUCT_CHANGED", previous.security.antivirusProduct, current.security.antivirusProduct, "MEDIUM");
  addChange(changes, "FIREWALL_STATE_CHANGED", previous.security.firewallEnabled, current.security.firewallEnabled, current.security.firewallEnabled === false ? "CRITICAL" : "INFO");
  addChange(changes, "BITLOCKER_STATE_CHANGED", previous.security.bitLockerEnabled, current.security.bitLockerEnabled, current.security.bitLockerEnabled === false ? "HIGH" : "INFO");
  addChange(changes, "SECURE_BOOT_CHANGED", previous.security.secureBootEnabled, current.security.secureBootEnabled, current.security.secureBootEnabled === false ? "MEDIUM" : "INFO");
  addChange(changes, "TPM_STATE_CHANGED", previous.security.tpmReady, current.security.tpmReady, current.security.tpmReady === false ? "MEDIUM" : "INFO");

  const previousSoftware = new Map(previous.software.map((item) => [`${normalizeNetworkValue(item.name)}|${normalizeNetworkValue(item.publisher)}`, item]));
  const currentSoftware = new Map(current.software.map((item) => [`${normalizeNetworkValue(item.name)}|${normalizeNetworkValue(item.publisher)}`, item]));
  for (const [key, software] of currentSoftware) if (!previousSoftware.has(key)) changes.push({ changeType: "SOFTWARE_INSTALLED", previousValue: null, newValue: software, severity: "INFO" });
  for (const [key, software] of previousSoftware) if (!currentSoftware.has(key)) changes.push({ changeType: "SOFTWARE_REMOVED", previousValue: software, newValue: null, severity: "INFO" });
  return changes;
}

export type AssetMatchCandidate = {
  id: string;
  workspaceId: string;
  clientId?: string | null;
  siteId?: string | null;
  manufacturer?: string | null;
  serialNumber?: string | null;
  hostname?: string | null;
  macAddress?: string | null;
};

export function matchAssetCandidates(
  audit: EndpointAudit,
  assets: AssetMatchCandidate[],
  scope: { workspaceId: string; clientId: string; siteId: string },
) {
  const scoped = assets.filter((asset) => asset.workspaceId === scope.workspaceId && asset.clientId === scope.clientId && (!asset.siteId || asset.siteId === scope.siteId));
  const serial = normalizeNetworkValue(audit.device.serialNumber);
  const manufacturer = normalizeNetworkValue(audit.device.manufacturer);
  const hostname = normalizeNetworkValue(audit.device.computerName);
  const macs = new Set(audit.network.adapters.map((adapter) => normalizeMacAddress(adapter.macAddress)).filter(Boolean));
  const scored = scoped.map((asset) => {
    let score = 0;
    const reasons: string[] = [];
    if (serial && serial === normalizeNetworkValue(asset.serialNumber) && manufacturer === normalizeNetworkValue(asset.manufacturer)) { score += 100; reasons.push("serial_manufacturer"); }
    if (hostname && hostname === normalizeNetworkValue(asset.hostname)) { score += 50; reasons.push("hostname"); }
    if (normalizeMacAddress(asset.macAddress) && macs.has(normalizeMacAddress(asset.macAddress))) { score += 40; reasons.push("mac_address"); }
    return { asset, score, reasons };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score);
  const topScore = scored[0]?.score ?? 0;
  const top = scored.filter((candidate) => candidate.score === topScore);
  return {
    status: top.length === 0 ? "UNMATCHED" : top.length === 1 ? "MATCHED" : "AMBIGUOUS",
    assetId: top.length === 1 ? top[0]?.asset.id ?? null : null,
    candidates: top.map((candidate) => ({ assetId: candidate.asset.id, score: candidate.score, reasons: candidate.reasons })),
  } as const;
}

export function buildAlertConditions(audit: EndpointAudit, policy: MonitoringPolicyLike = defaultMonitoringPolicy) {
  const posture = calculateEndpointPosture(audit, policy);
  const conditions: Array<{ type: string; severity: keyof typeof alertSeverityLabels; description: string }> = [];
  if (posture.diskState === "CRITICAL") conditions.push({ type: "CRITICAL_DISK_SPACE", severity: "CRITICAL", description: `Disk utilisation reached ${posture.maximumDiskUsedPercent.toFixed(0)}%.` });
  else if (posture.diskState === "WARNING") conditions.push({ type: "LOW_DISK_SPACE", severity: "HIGH", description: `Disk utilisation reached ${posture.maximumDiskUsedPercent.toFixed(0)}%.` });
  const descriptions: Record<string, [keyof typeof alertSeverityLabels, string]> = {
    ANTIVIRUS_DISABLED: ["CRITICAL", "Antivirus protection is disabled or could not be verified."],
    FIREWALL_DISABLED: ["CRITICAL", "Windows Firewall is disabled or could not be verified."],
    BITLOCKER_DISABLED: ["HIGH", "BitLocker encryption is disabled or could not be verified."],
    SECURE_BOOT_DISABLED: ["MEDIUM", "Secure Boot is disabled or could not be verified."],
    TPM_NOT_READY: ["MEDIUM", "The TPM is not ready or could not be verified."],
    UNSUPPORTED_WINDOWS_VERSION: ["HIGH", "The Windows build is outside the policy allowlist."],
    PENDING_RESTART: ["LOW", "Windows reports that a restart is pending."],
  };
  for (const failure of posture.failures) {
    const description = descriptions[failure];
    if (description) conditions.push({ type: failure, severity: description[0], description: description[1] });
  }
  return conditions;
}

export function alertDeduplicationKey(endpointId: string, type: string) {
  return `${endpointId}:${type}`.toLowerCase().replace(/[^a-z0-9:_-]/g, "-");
}

export function isEndpointOnline(lastCheckIn: Date | null | undefined, offlineThresholdMinutes: number, now = new Date()) {
  if (!lastCheckIn) return false;
  return now.getTime() - lastCheckIn.getTime() <= offlineThresholdMinutes * 60_000;
}

export function semverAtLeast(version: string, minimum: string) {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(version);
  const right = parse(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) > (right[index] ?? 0)) return true;
    if ((left[index] ?? 0) < (right[index] ?? 0)) return false;
  }
  return true;
}
