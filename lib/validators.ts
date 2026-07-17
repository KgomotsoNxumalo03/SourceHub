import { z } from "zod";

import { assetCustomFieldMapSchema } from "@/lib/assets";

export { assetCustomFieldMapSchema } from "@/lib/assets";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const profileSchema = z.object({
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  profileImageUrl: z.string().trim().url("Enter a valid image URL").optional().or(z.literal("")),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(8, "Enter your current password"),
    newPassword: z.string().min(12, "New password must be at least 12 characters"),
    confirmPassword: z.string().min(12, "Confirm the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const userFormSchema = z.object({
  employeeNumber: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  profileImageUrl: z.string().trim().url().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  roleIds: z.array(z.string().min(1)).default([]),
  password: z.string().min(12).optional().or(z.literal("")),
});

export const roleFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(255).optional().or(z.literal("")),
  isSystemRole: z.coerce.boolean().default(false),
  permissionIds: z.array(z.string().min(1)).default([]),
});

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(4, "Subject is required").max(160),
  description: z.string().trim().min(10, "Description is required"),
  categoryId: z.string().trim().optional().or(z.literal("")),
  assetId: z.string().trim().optional().or(z.literal("")),
  clientId: z.string().trim().optional().or(z.literal("")),
  siteId: z.string().trim().optional().or(z.literal("")),
  supportAgreementId: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  requesterId: z.string().trim().optional().or(z.literal("")),
  assigneeId: z.string().trim().optional().or(z.literal("")),
});

export const ticketUpdateSchema = z.object({
  subject: z.string().trim().min(4, "Subject is required").max(160),
  description: z.string().trim().min(10, "Description is required"),
  categoryId: z.string().trim().optional().or(z.literal("")),
  assetId: z.string().trim().optional().or(z.literal("")),
  clientId: z.string().trim().optional().or(z.literal("")),
  siteId: z.string().trim().optional().or(z.literal("")),
  supportAgreementId: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  status: z.enum(["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"]),
});

export const ticketAssignmentSchema = z.object({
  assigneeId: z.string().trim().optional().or(z.literal("")),
});

export const ticketCommentSchema = z.object({
  body: z.string().trim().min(1, "Add a message before submitting"),
  visibility: z.enum(["public", "internal"]),
});

export const ticketListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  search: z.string().trim().optional().default(""),
  status: z.string().trim().optional().default(""),
  priority: z.string().trim().optional().default(""),
  category: z.string().trim().optional().default(""),
  queue: z.string().trim().optional().default("all"),
});

export const settingsSchema = z.object({
  companyName: z.string().trim().min(1),
  tradingName: z.string().trim().min(1),
  supportEmail: z.string().trim().email(),
  contactNumber: z.string().trim().min(1),
  website: z.string().trim().url(),
  timezone: z.string().trim().min(1),
  country: z.string().trim().min(1),
  defaultDateFormat: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  primaryColor: z.string().trim().min(1),
  secondaryColor: z.string().trim().min(1),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional().default(""),
  status: z.string().trim().optional().default(""),
  role: z.string().trim().optional().default(""),
});

export const slaPolicyFormSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().or(z.literal("")),
  active: z.coerce.boolean().default(true),
  clientId: z.string().trim().optional().or(z.literal("")),
  supportAgreementId: z.string().trim().optional().or(z.literal("")),
  priority: z.string().trim().optional().or(z.literal("")),
  categoryId: z.string().trim().optional().or(z.literal("")),
  firstResponseMinutes: z.coerce.number().int().min(1),
  resolutionMinutes: z.coerce.number().int().min(1),
  businessHoursStart: z.string().trim().min(4),
  businessHoursEnd: z.string().trim().min(4),
  workingDays: z.array(z.string().trim().min(1)).default([]),
  publicHolidays: z.array(z.string().trim().min(1)).default([]),
  pauseConditions: z.array(z.string().trim().min(1)).default([]),
  escalationRules: z.array(z.string().trim().min(1)).default([]),
});

export const clientFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  legalName: z.string().trim().optional().or(z.literal("")),
  code: z.string().trim().min(1).max(40),
  status: z.enum(["ACTIVE", "ONBOARDING", "PAUSED", "FORMER"]),
  workspaceId: z.string().trim().min(1),
  website: z.string().trim().url().optional().or(z.literal("")),
  supportEmail: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  industry: z.string().trim().optional().or(z.literal("")),
  accountManagerId: z.string().trim().optional().or(z.literal("")),
});

export const clientContactFormSchema = z.object({
  clientId: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional().or(z.literal("")),
  title: z.string().trim().optional().or(z.literal("")),
  isPrimary: z.coerce.boolean().default(false),
  portalAccess: z.coerce.boolean().default(false),
});

export const clientSiteFormSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  city: z.string().trim().optional().or(z.literal("")),
  province: z.string().trim().optional().or(z.literal("")),
  country: z.string().trim().optional().or(z.literal("")),
  addressLine1: z.string().trim().optional().or(z.literal("")),
  addressLine2: z.string().trim().optional().or(z.literal("")),
  postalCode: z.string().trim().optional().or(z.literal("")),
  isPrimary: z.coerce.boolean().default(false),
});

export const contractFormSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRING_SOON", "EXPIRED", "ENDED"]),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().optional().or(z.literal("")),
  autoRenew: z.coerce.boolean().default(false),
  value: z.string().trim().optional().or(z.literal("")),
});

export const supportAgreementFormSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  active: z.coerce.boolean().default(true),
  priority: z.string().trim().optional().or(z.literal("")),
  categoryId: z.string().trim().optional().or(z.literal("")),
  siteId: z.string().trim().optional().or(z.literal("")),
  supportWindow: z.string().trim().optional().or(z.literal("")),
});

export const billingProfileFormSchema = z.object({
  clientId: z.string().trim().min(1),
  legalName: z.string().trim().min(1),
  taxNumber: z.string().trim().optional().or(z.literal("")),
  invoiceEmail: z.string().trim().email().optional().or(z.literal("")),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "ANNUALLY"]),
  creditTerms: z.coerce.number().int().min(0).default(30),
});

export const clientNoteFormSchema = z.object({
  clientId: z.string().trim().min(1),
  body: z.string().trim().min(1),
  visibility: z.enum(["internal", "shared"]),
});

export const portalInvitationFormSchema = z.object({
  clientId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
  role: z.enum(["REQUESTER", "APPROVER", "BILLING", "ADMIN"]),
});

export const emailConfigFormSchema = z.object({
  supportAddress: z.string().trim().email(),
  provider: z.enum(["dev", "imap"]),
  imapHost: z.string().trim().optional().or(z.literal("")),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  imapUsername: z.string().trim().optional().or(z.literal("")),
  imapPassword: z.string().trim().optional().or(z.literal("")),
  secure: z.coerce.boolean().default(true),
});

export const emailAttachmentFormSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.coerce.number().int().min(1),
});

export const automationRuleFormSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().or(z.literal("")),
  active: z.coerce.boolean().default(true),
  trigger: z.string().trim().min(1),
  action: z.string().trim().min(1),
  thresholdPercent: z.coerce.number().int().min(1).max(100).default(75),
  targetRole: z.string().trim().optional().or(z.literal("")),
});

export const assetTypeFieldDefinitionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "number", "date", "boolean", "select"]),
  required: z.coerce.boolean().default(false),
  options: z.array(z.string().trim().min(1)).default([]),
  helpText: z.string().trim().optional().or(z.literal("")),
});

export const assetTypeFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().optional().or(z.literal("")),
  icon: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  prefix: z.string().trim().min(2).max(12),
  active: z.coerce.boolean().default(true),
  requiredFields: z.array(z.string().trim().min(1)).default([]),
  customFields: z.array(assetTypeFieldDefinitionSchema).default([]),
});

export const assetFormSchema = z.object({
  assetTypeId: z.string().trim().min(1),
  assetTag: z.string().trim().optional().or(z.literal("")),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  status: z.enum(["ORDERED", "IN_STOCK", "PREPARING", "DEPLOYED", "ACTIVE", "UNDER_REPAIR", "LOANED", "IN_STORAGE", "LOST", "STOLEN", "RETIRED", "DISPOSED", "ARCHIVED"]),
  ownershipType: z.enum(["INTERNAL", "CLIENT"]),
  clientId: z.string().trim().optional().or(z.literal("")),
  siteId: z.string().trim().optional().or(z.literal("")),
  contactId: z.string().trim().optional().or(z.literal("")),
  assignedUserId: z.string().trim().optional().or(z.literal("")),
  responsibleTechnicianId: z.string().trim().optional().or(z.literal("")),
  department: z.string().trim().optional().or(z.literal("")),
  physicalLocation: z.string().trim().optional().or(z.literal("")),
  manufacturer: z.string().trim().optional().or(z.literal("")),
  model: z.string().trim().optional().or(z.literal("")),
  serialNumber: z.string().trim().optional().or(z.literal("")),
  barcode: z.string().trim().optional().or(z.literal("")),
  qrCodeValue: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  internalNotes: z.string().trim().optional().or(z.literal("")),
  cpu: z.string().trim().optional().or(z.literal("")),
  ram: z.string().trim().optional().or(z.literal("")),
  storageCapacity: z.string().trim().optional().or(z.literal("")),
  storageType: z.string().trim().optional().or(z.literal("")),
  operatingSystem: z.string().trim().optional().or(z.literal("")),
  windowsVersion: z.string().trim().optional().or(z.literal("")),
  architecture: z.string().trim().optional().or(z.literal("")),
  hostname: z.string().trim().optional().or(z.literal("")),
  ipAddress: z.string().trim().optional().or(z.literal("")),
  macAddress: z.string().trim().optional().or(z.literal("")),
  networkDomain: z.string().trim().optional().or(z.literal("")),
  biosVersion: z.string().trim().optional().or(z.literal("")),
  motherboard: z.string().trim().optional().or(z.literal("")),
  screenSizeInches: z.coerce.number().optional().or(z.literal(null)).default(null),
  batteryHealth: z.string().trim().optional().or(z.literal("")),
  antivirusProduct: z.string().trim().optional().or(z.literal("")),
  antivirusStatus: z.string().trim().optional().or(z.literal("")),
  encryptionStatus: z.string().trim().optional().or(z.literal("")),
  bitLockerStatus: z.string().trim().optional().or(z.literal("")),
  firewallStatus: z.string().trim().optional().or(z.literal("")),
  lastLoggedInUser: z.string().trim().optional().or(z.literal("")),
  lastCheckIn: z.string().trim().optional().or(z.literal("")),
  uptime: z.string().trim().optional().or(z.literal("")),
  freeDiskSpaceGb: z.coerce.number().optional().or(z.literal(null)).default(null),
  healthState: z.string().trim().optional().or(z.literal("")),
  complianceState: z.string().trim().optional().or(z.literal("")),
  monitoringState: z.string().trim().optional().or(z.literal("")),
  supplier: z.string().trim().optional().or(z.literal("")),
  purchaseDate: z.string().trim().optional().or(z.literal("")),
  purchasePrice: z.string().trim().optional().or(z.literal("")),
  currency: z.string().trim().optional().or(z.literal("")),
  invoiceReference: z.string().trim().optional().or(z.literal("")),
  warrantyStartDate: z.string().trim().optional().or(z.literal("")),
  warrantyExpiryDate: z.string().trim().optional().or(z.literal("")),
  warrantyProvider: z.string().trim().optional().or(z.literal("")),
  warrantyReference: z.string().trim().optional().or(z.literal("")),
  warrantyStatus: z.string().trim().optional().or(z.literal("")),
  replacementValue: z.string().trim().optional().or(z.literal("")),
  expectedReplacementDate: z.string().trim().optional().or(z.literal("")),
  acquisitionDate: z.string().trim().optional().or(z.literal("")),
  deploymentDate: z.string().trim().optional().or(z.literal("")),
  lastServiceDate: z.string().trim().optional().or(z.literal("")),
  nextServiceDate: z.string().trim().optional().or(z.literal("")),
  retirementDate: z.string().trim().optional().or(z.literal("")),
  disposalDate: z.string().trim().optional().or(z.literal("")),
  disposalMethod: z.string().trim().optional().or(z.literal("")),
  disposalCertificate: z.string().trim().optional().or(z.literal("")),
  customFields: assetCustomFieldMapSchema.default({}),
});

export const assetAssignmentFormSchema = z.object({
  assetId: z.string().trim().min(1),
  assignmentType: z.enum(["USER", "CLIENT", "SITE", "CONTACT", "DEPARTMENT", "STORAGE"]),
  targetId: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  transferNotes: z.string().trim().optional().or(z.literal("")),
});

export const assetStatusFormSchema = z.object({
  assetId: z.string().trim().min(1),
  status: z.enum(["ORDERED", "IN_STOCK", "PREPARING", "DEPLOYED", "ACTIVE", "UNDER_REPAIR", "LOANED", "IN_STORAGE", "LOST", "STOLEN", "RETIRED", "DISPOSED", "ARCHIVED"]),
  notes: z.string().trim().optional().or(z.literal("")),
  reason: z.string().trim().optional().or(z.literal("")),
  disposalMethod: z.string().trim().optional().or(z.literal("")),
  disposalCertificate: z.string().trim().optional().or(z.literal("")),
});

export const assetMaintenanceFormSchema = z.object({
  assetId: z.string().trim().min(1),
  maintenanceType: z.enum(["INSPECTION", "PREVENTATIVE_MAINTENANCE", "REPAIR", "UPGRADE", "CLEANING", "BATTERY_REPLACEMENT", "STORAGE_REPLACEMENT", "RAM_UPGRADE", "OS_RELOAD", "WARRANTY_CLAIM", "OTHER"]),
  description: z.string().trim().min(1),
  technicianId: z.string().trim().optional().or(z.literal("")),
  supplier: z.string().trim().optional().or(z.literal("")),
  ticketId: z.string().trim().optional().or(z.literal("")),
  startDate: z.string().trim().min(1),
  completionDate: z.string().trim().optional().or(z.literal("")),
  cost: z.string().trim().optional().or(z.literal("")),
  currency: z.string().trim().optional().or(z.literal("")),
  partsReplaced: z.string().trim().optional().or(z.literal("")),
  downtimeMinutes: z.coerce.number().int().min(0).default(0),
  outcome: z.string().trim().optional().or(z.literal("")),
  nextServiceDate: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const assetSoftwareFormSchema = z.object({
  assetId: z.string().trim().min(1),
  softwareName: z.string().trim().min(1),
  publisher: z.string().trim().optional().or(z.literal("")),
  version: z.string().trim().optional().or(z.literal("")),
  installationDate: z.string().trim().optional().or(z.literal("")),
  installationSource: z.string().trim().optional().or(z.literal("")),
  licenceId: z.string().trim().optional().or(z.literal("")),
  detectionSource: z.string().trim().optional().or(z.literal("")),
  lastDetectedDate: z.string().trim().optional().or(z.literal("")),
  approved: z.coerce.boolean().default(false),
  securityRiskState: z.string().trim().optional().or(z.literal("")),
  removalDate: z.string().trim().optional().or(z.literal("")),
});

export const softwareLicenceFormSchema = z.object({
  productName: z.string().trim().min(1),
  publisher: z.string().trim().optional().or(z.literal("")),
  licenceType: z.string().trim().min(1),
  licenceReference: z.string().trim().min(1),
  clientId: z.string().trim().optional().or(z.literal("")),
  totalSeats: z.coerce.number().int().min(0).default(1),
  purchaseDate: z.string().trim().optional().or(z.literal("")),
  renewalDate: z.string().trim().optional().or(z.literal("")),
  expiryDate: z.string().trim().optional().or(z.literal("")),
  cost: z.string().trim().optional().or(z.literal("")),
  currency: z.string().trim().optional().or(z.literal("")),
  supplier: z.string().trim().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "EXPIRING_SOON", "EXPIRED", "FULLY_ALLOCATED", "OVER_ALLOCATED", "SUSPENDED", "CANCELLED"]),
  secureNotes: z.string().trim().optional().or(z.literal("")),
  contractId: z.string().trim().optional().or(z.literal("")),
});

export const assetWarrantyFormSchema = z.object({
  assetId: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  reference: z.string().trim().optional().or(z.literal("")),
  startDate: z.string().trim().optional().or(z.literal("")),
  expiryDate: z.string().trim().optional().or(z.literal("")),
  warrantyType: z.string().trim().optional().or(z.literal("")),
  coverageDetails: z.string().trim().optional().or(z.literal("")),
  contactInfo: z.string().trim().optional().or(z.literal("")),
  claimHistory: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const assetFileFormSchema = z.object({
  assetId: z.string().trim().min(1),
  category: z.enum(["purchase", "warranty", "disposal", "photo", "repair", "maintenance", "supplier", "other"]),
  description: z.string().trim().optional().or(z.literal("")),
});

export const assetImportFormSchema = z.object({
  importKey: z.string().trim().min(1),
  csvContent: z.string().trim().min(1),
});
