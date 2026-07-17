import { z } from "zod";

export const assetStatusLabels = {
  ORDERED: "Ordered",
  IN_STOCK: "In stock",
  PREPARING: "Preparing",
  DEPLOYED: "Deployed",
  ACTIVE: "Active",
  UNDER_REPAIR: "Under repair",
  LOANED: "Loaned",
  IN_STORAGE: "In storage",
  LOST: "Lost",
  STOLEN: "Stolen",
  RETIRED: "Retired",
  DISPOSED: "Disposed",
  ARCHIVED: "Archived",
} as const;

export const assetOwnershipLabels = {
  INTERNAL: "Internal",
  CLIENT: "Client-owned",
} as const;

export const assetHealthLabels = {
  HEALTHY: "Healthy",
  MONITOR: "Monitor",
  AT_RISK: "At risk",
  CRITICAL: "Critical",
  OFFLINE: "Offline",
  UNKNOWN: "Unknown",
} as const;

export const assetComplianceLabels = {
  COMPLIANT: "Compliant",
  AT_RISK: "At risk",
  NON_COMPLIANT: "Non-compliant",
  UNKNOWN: "Unknown",
} as const;

export const warrantyStatusLabels = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Expiring soon",
  EXPIRED: "Expired",
  UNKNOWN: "Unknown",
} as const;

export const softwareLicenceStatusLabels = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Expiring soon",
  EXPIRED: "Expired",
  FULLY_ALLOCATED: "Fully allocated",
  OVER_ALLOCATED: "Over-allocated",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
} as const;

export const maintenanceTypeLabels = {
  INSPECTION: "Inspection",
  PREVENTATIVE_MAINTENANCE: "Preventative maintenance",
  REPAIR: "Repair",
  UPGRADE: "Upgrade",
  CLEANING: "Cleaning",
  BATTERY_REPLACEMENT: "Battery replacement",
  STORAGE_REPLACEMENT: "Storage replacement",
  RAM_UPGRADE: "RAM upgrade",
  OS_RELOAD: "Operating-system reload",
  WARRANTY_CLAIM: "Warranty claim",
  OTHER: "Other",
} as const;

export type AssetTypeField = "overview" | "hardware" | "network" | "security" | "software" | "licences" | "warranty" | "maintenance";

export type AssetCustomFieldDefinition = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select";
  required?: boolean;
  options?: string[];
  helpText?: string | null;
};

export type AssetTypeDefinition = {
  name: string;
  description: string;
  icon: string;
  category: string;
  prefix: string;
  requiredFields: string[];
  customFields: AssetCustomFieldDefinition[];
};

export const builtInAssetTypes: Record<string, AssetTypeDefinition> = {
  desktop: {
    name: "Desktop computer",
    description: "Workstation or office desktop.",
    icon: "monitor",
    category: "Computer",
    prefix: "DESK",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  laptop: {
    name: "Laptop",
    description: "Portable workstation.",
    icon: "laptop",
    category: "Computer",
    prefix: "LAP",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [
      { key: "batteryHealth", label: "Battery health", type: "text", helpText: "Current battery health rating or percentage." },
    ],
  },
  server: {
    name: "Server",
    description: "Physical server hardware.",
    icon: "server",
    category: "Infrastructure",
    prefix: "SRV",
    requiredFields: ["manufacturer", "model", "serialNumber", "hostname"],
    customFields: [],
  },
  virtualServer: {
    name: "Virtual server",
    description: "VM or cloud-hosted server.",
    icon: "cloud",
    category: "Infrastructure",
    prefix: "VSRV",
    requiredFields: ["manufacturer", "model", "hostname"],
    customFields: [],
  },
  printer: {
    name: "Printer",
    description: "Print device.",
    icon: "printer",
    category: "Peripherals",
    prefix: "PRN",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  scanner: {
    name: "Scanner",
    description: "Document scanner.",
    icon: "scan",
    category: "Peripherals",
    prefix: "SCN",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  switch: {
    name: "Switch",
    description: "Network switch.",
    icon: "network",
    category: "Network",
    prefix: "SWT",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  router: {
    name: "Router",
    description: "WAN or branch router.",
    icon: "router",
    category: "Network",
    prefix: "RTR",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  firewall: {
    name: "Firewall",
    description: "Firewall or security gateway.",
    icon: "shield",
    category: "Security",
    prefix: "FW",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  accessPoint: {
    name: "Wireless access point",
    description: "Wi-Fi access point.",
    icon: "wifi",
    category: "Network",
    prefix: "AP",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  mobilePhone: {
    name: "Mobile phone",
    description: "Smartphone or cellular device.",
    icon: "smartphone",
    category: "Mobile",
    prefix: "MOB",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  tablet: {
    name: "Tablet",
    description: "Tablet device.",
    icon: "tablet",
    category: "Mobile",
    prefix: "TAB",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  monitor: {
    name: "Monitor",
    description: "Display screen.",
    icon: "monitor",
    category: "Peripherals",
    prefix: "MON",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [
      { key: "screenSizeInches", label: "Screen size", type: "number", helpText: "Diagonal screen size in inches." },
    ],
  },
  ups: {
    name: "UPS",
    description: "Uninterruptible power supply.",
    icon: "battery",
    category: "Power",
    prefix: "UPS",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  storageDevice: {
    name: "Storage device",
    description: "External storage device.",
    icon: "hard-drive",
    category: "Storage",
    prefix: "STO",
    requiredFields: ["manufacturer", "model", "serialNumber"],
    customFields: [],
  },
  nas: {
    name: "Network-attached storage",
    description: "NAS appliance.",
    icon: "database",
    category: "Storage",
    prefix: "NAS",
    requiredFields: ["manufacturer", "model", "serialNumber", "hostname"],
    customFields: [],
  },
  softwareLicence: {
    name: "Software licence",
    description: "Software entitlement record.",
    icon: "key-round",
    category: "Software",
    prefix: "LIC",
    requiredFields: ["name"],
    customFields: [],
  },
  peripheral: {
    name: "Peripheral",
    description: "Accessory or peripheral device.",
    icon: "mouse",
    category: "Peripherals",
    prefix: "PER",
    requiredFields: ["manufacturer", "model"],
    customFields: [],
  },
  other: {
    name: "Other",
    description: "Custom asset type.",
    icon: "boxes",
    category: "Other",
    prefix: "AST",
    requiredFields: ["name"],
    customFields: [],
  },
};

export const assetStatusTransitions: Record<string, readonly string[]> = {
  ORDERED: ["IN_STOCK", "PREPARING", "ARCHIVED"],
  IN_STOCK: ["PREPARING", "DEPLOYED", "IN_STORAGE", "ARCHIVED"],
  PREPARING: ["DEPLOYED", "IN_STOCK", "IN_STORAGE", "ARCHIVED"],
  DEPLOYED: ["ACTIVE", "UNDER_REPAIR", "LOANED", "RETIRED"],
  ACTIVE: ["UNDER_REPAIR", "LOANED", "LOST", "STOLEN", "RETIRED", "ARCHIVED"],
  UNDER_REPAIR: ["ACTIVE", "IN_STORAGE", "RETIRED"],
  LOANED: ["ACTIVE", "IN_STORAGE", "RETIRED"],
  IN_STORAGE: ["PREPARING", "DEPLOYED", "RETIRED", "ARCHIVED"],
  LOST: ["STOLEN", "RETIRED", "ARCHIVED"],
  STOLEN: ["RETIRED", "ARCHIVED"],
  RETIRED: ["DISPOSED", "ARCHIVED"],
  DISPOSED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionAssetStatus(from: keyof typeof assetStatusLabels | string, to: keyof typeof assetStatusLabels | string) {
  return assetStatusTransitions[from]?.includes(to) ?? false;
}

export function requiresSensitiveTransitionNote(from: string, to: string) {
  return ["LOST", "STOLEN", "DISPOSED", "RETIRED"].includes(to) || ["DISPOSED", "STOLEN"].includes(from);
}

export function requiresReasonForStatus(status: string) {
  return ["LOST", "STOLEN"].includes(status);
}

export function requiresDisposalDetails(status: string) {
  return status === "DISPOSED";
}

export function tagFromPrefix(prefix: string, sequence: number, padding = 5) {
  return `${prefix}-${String(sequence).padStart(padding, "0")}`;
}

export function defaultAssetPrefixFromType(typeId: string) {
  return builtInAssetTypes[typeId]?.prefix ?? "AST";
}

export function assetSearchTokens(values: Array<string | null | undefined>) {
  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const normalized = String(value).toLowerCase();
    tokens.add(normalized);
    for (const part of normalized.split(/[^a-z0-9]+/g)) {
      if (part.length >= 2) tokens.add(part);
    }
  }
  return Array.from(tokens);
}

export const assetFileCategories = ["purchase", "warranty", "disposal", "photo", "repair", "maintenance", "supplier", "other"] as const;

export const assetFileCategoryLabels = {
  purchase: "Purchase",
  warranty: "Warranty",
  disposal: "Disposal",
  photo: "Photo",
  repair: "Repair",
  maintenance: "Maintenance",
  supplier: "Supplier",
  other: "Other",
} as const;

export function calculateWarrantyStatus(input: { expiryDate?: Date | null; startDate?: Date | null; status?: string | null }, now = new Date()) {
  if (!input.expiryDate) return "UNKNOWN" as const;
  const remainingDays = Math.ceil((input.expiryDate.getTime() - now.getTime()) / 86_400_000);
  if (remainingDays < 0) return "EXPIRED" as const;
  if (remainingDays <= 45) return "EXPIRING_SOON" as const;
  return "ACTIVE" as const;
}

export function calculateLicenceStatus(input: {
  expiryDate?: Date | null;
  status?: string | null;
  totalSeats?: number | null;
  usedSeats?: number | null;
}, now = new Date()) {
  if (input.status === "CANCELLED" || input.status === "SUSPENDED") return input.status as keyof typeof softwareLicenceStatusLabels;
  if (input.expiryDate) {
    const remainingDays = Math.ceil((input.expiryDate.getTime() - now.getTime()) / 86_400_000);
    if (remainingDays < 0) return "EXPIRED" as const;
    if (remainingDays <= 45) return "EXPIRING_SOON" as const;
  }
  if ((input.totalSeats ?? 0) > 0 && (input.usedSeats ?? 0) >= (input.totalSeats ?? 0)) {
    return (input.usedSeats ?? 0) > (input.totalSeats ?? 0) ? "OVER_ALLOCATED" : "FULLY_ALLOCATED";
  }
  return "ACTIVE" as const;
}

export function calculateAssetHealth(input: {
  lastCheckIn?: Date | null;
  freeDiskSpaceGb?: number | null;
  antivirusStatus?: string | null;
  encryptionStatus?: string | null;
  openCriticalTickets?: number | null;
  warrantyStatus?: string | null;
  hardwareAgeMonths?: number | null;
  repeatedFailures?: number | null;
  maintenanceDue?: boolean | null;
  status?: string | null;
}, now = new Date()) {
  if (input.status === "LOST" || input.status === "STOLEN") return "CRITICAL" as const;
  if (input.status === "DISPOSED" || input.status === "ARCHIVED") return "UNKNOWN" as const;
  if (input.lastCheckIn && now.getTime() - input.lastCheckIn.getTime() > 1000 * 60 * 60 * 24 * 14) return "OFFLINE" as const;
  if ((input.openCriticalTickets ?? 0) >= 2 || (input.repeatedFailures ?? 0) >= 3) return "CRITICAL" as const;
  if ((input.freeDiskSpaceGb ?? 100) <= 10 || input.antivirusStatus === "OFF" || input.encryptionStatus === "OFF" || input.warrantyStatus === "EXPIRED") {
    return "AT_RISK" as const;
  }
  if ((input.freeDiskSpaceGb ?? 100) <= 20 || input.maintenanceDue) return "MONITOR" as const;
  return "HEALTHY" as const;
}

export function calculateAssetCompliance(input: {
  antivirusStatus?: string | null;
  encryptionStatus?: string | null;
  supportedOs?: boolean | null;
  requiredSoftware?: boolean | null;
  prohibitedSoftware?: boolean | null;
  recentCheckIn?: boolean | null;
}) {
  if (input.prohibitedSoftware === true) return "NON_COMPLIANT" as const;
  if (input.antivirusStatus === "OFF" || input.encryptionStatus === "OFF" || input.supportedOs === false) return "AT_RISK" as const;
  if (input.requiredSoftware === false || input.recentCheckIn === false) return "AT_RISK" as const;
  return "COMPLIANT" as const;
}

export function assetQrcodeValue(baseUrl: string, assetId: string) {
  return `${baseUrl.replace(/\/$/, "")}/assets/${assetId}`;
}

export const assetFieldGroupsByCategory: Record<string, string[]> = {
  Computer: ["overview", "hardware", "network", "security", "software", "licences", "warranty", "maintenance"],
  Infrastructure: ["overview", "hardware", "network", "security", "warranty", "maintenance"],
  Network: ["overview", "hardware", "network", "security", "warranty", "maintenance"],
  Security: ["overview", "hardware", "network", "security", "maintenance"],
  Mobile: ["overview", "hardware", "security", "software", "warranty", "maintenance"],
  Peripherals: ["overview", "hardware", "warranty", "maintenance"],
  Power: ["overview", "hardware", "warranty", "maintenance"],
  Storage: ["overview", "hardware", "network", "warranty", "maintenance"],
  Software: ["overview", "licences"],
  Other: ["overview"],
};

export function assetFieldSectionsForType(typeId: string) {
  const type = builtInAssetTypes[typeId];
  return type ? assetFieldGroupsByCategory[type.category] ?? ["overview"] : ["overview"];
}

export const assetCustomFieldValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(assetCustomFieldValueSchema),
    z.record(z.string(), assetCustomFieldValueSchema),
  ]),
);

export const assetCustomFieldMapSchema = z.record(z.string().min(1), assetCustomFieldValueSchema);

