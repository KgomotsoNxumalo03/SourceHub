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

const optionalText = z.string().trim().optional().or(z.literal(""));
const moneyInput = z.string().trim().regex(/^\d+(?:\.\d{1,4})?$/, "Enter a valid non-negative amount.");
export const financeLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.string().trim().regex(/^\d+(?:\.\d{1,3})?$/),
  unit: optionalText,
  unitPrice: moneyInput,
  discountBps: z.coerce.number().int().min(0).max(10000).default(0),
  vatRateBps: z.coerce.number().int().min(0).max(10000).default(0),
  vatClassification: optionalText,
  productOrServiceReference: optionalText,
  projectId: optionalText,
  taskId: optionalText,
  sortOrder: z.coerce.number().int().min(0).optional(),
});
export const financeSettingsSchema = z.object({
  legalCompanyName: z.string().trim().min(1), tradingName: z.string().trim().min(1),
  registrationNumber: optionalText, vatNumber: optionalText, companyAddress: z.string().trim().min(1),
  billingEmail: z.string().trim().email(), telephone: z.string().trim().min(1), website: optionalText,
  defaultCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  defaultVatRateBps: z.coerce.number().int().min(0).max(10000),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365), quoteValidityDays: z.coerce.number().int().min(1).max(365),
  quoteNumberFormat: z.string().trim().min(1), invoiceNumberFormat: z.string().trim().min(1),
  creditNoteNumberFormat: z.string().trim().min(1), purchaseOrderNumberFormat: z.string().trim().min(1),
  expenseNumberFormat: z.string().trim().min(1), financialYearStart: z.string().regex(/^\d{2}-\d{2}$/),
  invoiceFooter: optionalText, bankingDetailDisplay: z.coerce.boolean().default(false), approvalThresholds: optionalText,
});
export const clientBillingProfileSchema = z.object({
  clientId: z.string().trim().min(1), legalBillingName: z.string().trim().min(1), vatNumber: optionalText,
  registrationNumber: optionalText, billingContactId: optionalText, billingEmail: z.string().trim().email(),
  billingAddress: z.string().trim().min(1), accountReference: optionalText, paymentTermsDays: z.coerce.number().int().min(0).max(365),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()), purchaseOrderRequired: z.coerce.boolean().default(false),
  defaultVatRateBps: z.coerce.number().int().min(0).max(10000), creditLimitMinorUnits: moneyInput.optional(), accountStatus: z.enum(["ACTIVE", "ON_HOLD", "SUSPENDED", "CLOSED"]), financeNotes: optionalText,
});
export const quoteSchema = z.object({ clientId: z.string().trim().min(1), siteId: optionalText, projectId: optionalText, contractId: optionalText,
  salespersonId: optionalText, quoteDate: z.string().trim().min(1), expiryDate: z.string().trim().min(1), currency: z.string().length(3),
  terms: optionalText, internalNotes: optionalText, clientNotes: optionalText, purchaseOrderRequired: z.coerce.boolean().default(false), lines: z.array(financeLineSchema).min(1), });
export const invoiceSchema = z.object({ clientId: z.string().trim().min(1), siteId: optionalText, projectId: optionalText, contractId: optionalText,
  quoteId: optionalText, purchaseOrderReference: optionalText, invoiceDate: z.string().trim().min(1), dueDate: z.string().trim().min(1),
  currency: z.string().length(3), paymentTermsDays: z.coerce.number().int().min(0).max(365), clientNotes: optionalText, internalNotes: optionalText, lines: z.array(financeLineSchema).min(1), });
export const paymentSchema = z.object({ clientId: z.string().trim().min(1), paymentDate: z.string().trim().min(1), amount: moneyInput, currency: z.string().length(3),
  method: z.enum(["EFT", "BANK_DEPOSIT", "DEBIT_ORDER", "CARD_PROVIDER", "CASH", "CREDIT", "OTHER"]), bankReference: optionalText, notes: optionalText, });
export const paymentAllocationSchema = z.object({ paymentId: z.string().trim().min(1), invoiceId: z.string().trim().min(1), amount: moneyInput });
export const expenseSchema = z.object({ employeeId: z.string().trim().min(1), supplierId: optionalText, clientId: optionalText, projectId: optionalText, taskId: optionalText,
  category: z.string().trim().min(1), description: z.string().trim().min(1), expenseDate: z.string().trim().min(1), currency: z.string().length(3),
  amountExcludingVat: moneyInput, vatRateBps: z.coerce.number().int().min(0).max(10000), billable: z.coerce.boolean().default(false), reimbursable: z.coerce.boolean().default(false), paymentMethod: optionalText, });
export const supplierSchema = z.object({ name: z.string().trim().min(1), tradingName: optionalText, registrationNumber: optionalText, vatNumber: optionalText, category: optionalText,
  primaryContact: optionalText, email: z.string().trim().email().optional().or(z.literal("")), telephone: optionalText, website: optionalText, physicalAddress: optionalText,
  billingAddress: optionalText, paymentTermsDays: z.coerce.number().int().min(0).max(365), currency: z.string().length(3), bankingVerificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]), internalNotes: optionalText, });
export const purchaseOrderSchema = z.object({ supplierId: z.string().trim().min(1), clientId: optionalText, projectId: optionalText, requesterId: z.string().trim().min(1), orderDate: z.string().trim().min(1), expectedDeliveryDate: optionalText,
  currency: z.string().length(3), deliverySite: optionalText, supplierReference: optionalText, internalNotes: optionalText, lines: z.array(financeLineSchema).min(1), });
export const budgetSchema = z.object({ name: z.string().trim().min(1), ownerId: z.string().trim().min(1), scopeType: z.enum(["workspace", "department", "project", "client"]), departmentId: optionalText, clientId: optionalText, projectId: optionalText,
  periodStart: z.string().trim().min(1), periodEnd: z.string().trim().min(1), currency: z.string().length(3), approvedAmount: moneyInput, warningThresholdBps: z.coerce.number().int().min(0).max(10000), criticalThresholdBps: z.coerce.number().int().min(0).max(10000), notes: optionalText, });

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

export const employeeStatuses = ["PREBOARDING", "ACTIVE", "ON_LEAVE", "SUSPENDED", "NOTICE_PERIOD", "TERMINATED", "FORMER_EMPLOYEE", "ARCHIVED"] as const;
export const employeeTypes = ["PERMANENT", "FIXED_TERM", "PART_TIME", "TEMPORARY", "CONTRACTOR", "INTERN", "GRADUATE", "CONSULTANT"] as const;

const optionalDate = z.string().trim().optional().or(z.literal(""));

export const employeeFormSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(80),
  middleNames: z.string().trim().max(120).optional().or(z.literal("")),
  lastName: z.string().trim().min(1).max(80),
  preferredName: z.string().trim().max(80).optional().or(z.literal("")),
  workEmail: z.string().trim().email().max(180),
  personalEmail: z.string().trim().email().max(180).optional().or(z.literal("")),
  mobileNumber: z.string().trim().max(40).optional().or(z.literal("")),
  alternativePhone: z.string().trim().max(40).optional().or(z.literal("")),
  identityReference: z.string().trim().max(120).optional().or(z.literal("")),
  nationality: z.string().trim().max(80).optional().or(z.literal("")),
  preferredLanguage: z.string().trim().max(80).optional().or(z.literal("")),
  status: z.enum(employeeStatuses),
  employmentType: z.enum(employeeTypes),
  jobTitle: z.string().trim().max(160).optional().or(z.literal("")),
  departmentId: z.string().trim().optional().or(z.literal("")),
  teamId: z.string().trim().optional().or(z.literal("")),
  managerId: z.string().trim().optional().or(z.literal("")),
  secondaryManagerId: z.string().trim().optional().or(z.literal("")),
  workLocation: z.string().trim().max(160).optional().or(z.literal("")),
  workingArrangement: z.string().trim().max(80).optional().or(z.literal("")),
  startDate: optionalDate,
  probationEndDate: optionalDate,
  contractEndDate: optionalDate,
  terminationDate: optionalDate,
  terminationReason: z.string().trim().max(1000).optional().or(z.literal("")),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).default(0),
  standardHours: z.string().trim().max(80).optional().or(z.literal("")),
  costCentre: z.string().trim().max(80).optional().or(z.literal("")),
  internalNotes: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const employeeStatusSchema = z.object({
  employeeId: z.string().trim().min(1),
  status: z.enum(employeeStatuses),
  effectiveDate: optionalDate,
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const departmentFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(30).regex(/^[A-Z0-9_-]+$/),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  headId: z.string().trim().optional().or(z.literal("")),
  parentDepartmentId: z.string().trim().optional().or(z.literal("")),
  costCentre: z.string().trim().max(80).optional().or(z.literal("")),
});

export const teamFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  departmentId: z.string().trim().min(1),
  leaderId: z.string().trim().optional().or(z.literal("")),
});

export const jobTitleFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  departmentId: z.string().trim().optional().or(z.literal("")),
  seniority: z.string().trim().max(80).optional().or(z.literal("")),
});

export const employeeContractSchema = z.object({
  employeeId: z.string().trim().min(1),
  contractReference: z.string().trim().min(1).max(80),
  contractType: z.string().trim().min(1).max(80),
  startDate: z.string().trim().min(1),
  endDate: optionalDate,
  probationPeriodDays: z.coerce.number().int().min(0).max(730).default(0),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).default(0),
  workingHours: z.string().trim().max(80).optional().or(z.literal("")),
  workLocation: z.string().trim().max(160).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(160).optional().or(z.literal("")),
  departmentId: z.string().trim().optional().or(z.literal("")),
  managerId: z.string().trim().optional().or(z.literal("")),
  compensationSummary: z.string().trim().max(1000).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "EXPIRING_SOON", "EXPIRED", "RENEWED", "TERMINATED", "CANCELLED"]),
  signedDate: optionalDate,
  renewalDate: optionalDate,
  renewalType: z.string().trim().max(80).optional().or(z.literal("")),
  internalNotes: z.string().trim().max(3000).optional().or(z.literal("")),
});

export const emergencyContactSchema = z.object({
  employeeId: z.string().trim().min(1),
  fullName: z.string().trim().min(1).max(160),
  relationship: z.string().trim().min(1).max(80),
  primaryPhone: z.string().trim().min(7).max(40),
  alternativePhone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().max(180).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  primary: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const qualificationSchema = z.object({
  employeeId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(180),
  institution: z.string().trim().max(180).optional().or(z.literal("")),
  qualificationType: z.string().trim().max(100).optional().or(z.literal("")),
  fieldOfStudy: z.string().trim().max(160).optional().or(z.literal("")),
  issueDate: optionalDate,
  completionDate: optionalDate,
  expiryDate: optionalDate,
  certificateNumber: z.string().trim().max(120).optional().or(z.literal("")),
  verificationStatus: z.enum(["UNVERIFIED", "PENDING_VERIFICATION", "VERIFIED", "REJECTED", "EXPIRED"]),
  notes: z.string().trim().max(1500).optional().or(z.literal("")),
});

export const trainingSchema = z.object({
  employeeId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(180),
  provider: z.string().trim().max(180).optional().or(z.literal("")),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  assignedDate: optionalDate,
  dueDate: optionalDate,
  completionDate: optionalDate,
  completionStatus: z.enum(["ASSIGNED", "IN_PROGRESS", "COMPLETED", "OVERDUE", "FAILED", "CANCELLED", "EXPIRED"]),
  score: z.coerce.number().min(0).max(100).optional(),
  expiryDate: optionalDate,
  required: z.boolean().default(false),
  notes: z.string().trim().max(1500).optional().or(z.literal("")),
});

export const employeeNoteSchema = z.object({
  employeeId: z.string().trim().min(1),
  category: z.enum(["GENERAL", "HR", "MANAGER", "ONBOARDING", "OFFBOARDING", "TRAINING", "PERFORMANCE", "COMPLIANCE", "RESTRICTED"]),
  visibility: z.enum(["HR", "MANAGER", "EMPLOYEE", "RESTRICTED"]),
  body: z.string().trim().min(1).max(5000),
  pinned: z.boolean().default(false),
});

export const attendanceWorkModes = ["OFFICE", "REMOTE", "HYBRID", "CLIENT_SITE", "FIELD_WORK", "BUSINESS_TRAVEL", "TRAINING", "OTHER"] as const;
export const attendanceEventTypes = ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END", "MANUAL_ADJUSTMENT", "SYSTEM_CORRECTION"] as const;

export const attendanceProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1200).optional().or(z.literal("")),
  standardWorkingDays: z.array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])).min(1).max(7),
  standardStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  standardEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  expectedDailyHours: z.coerce.number().min(0).max(24),
  expectedWeeklyHours: z.coerce.number().min(0).max(168),
  breakEntitlementMinutes: z.coerce.number().int().min(0).max(600),
  breakPaid: z.boolean().default(false),
  lateGraceMinutes: z.coerce.number().int().min(0).max(180),
  earlyDepartureGraceMinutes: z.coerce.number().int().min(0).max(180),
  overtimeAfterDailyHours: z.coerce.number().min(0).max(24),
  overtimeMultiplier: z.coerce.number().min(1).max(5),
  roundingMinutes: z.coerce.number().int().min(1).max(60),
  allowedWorkModes: z.array(z.enum(attendanceWorkModes)).min(1),
  officeRequired: z.boolean().default(false),
  locationVerificationRequired: z.boolean().default(false),
  manualEntryAllowed: z.boolean().default(false),
  submissionFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  active: z.boolean().default(true),
});

export const workLocationSchema = z.object({
  name: z.string().trim().min(1).max(140),
  locationType: z.enum(["HEAD_OFFICE", "BRANCH_OFFICE", "CLIENT_SITE", "REMOTE", "HOME_OFFICE", "TEMPORARY_SITE", "OTHER"]),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  timeZone: z.string().trim().min(1).max(80),
  classification: z.enum(["OFFICE", "REMOTE"]),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  geofenceRadiusMetres: z.coerce.number().int().min(0).max(10000).optional(),
  allowedNetworks: z.string().trim().max(1000).optional().or(z.literal("")),
  verificationPolicy: z.enum(["NONE", "OPTIONAL", "REQUIRED"]),
  active: z.boolean().default(true),
});

export const workScheduleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  timeZone: z.string().trim().min(1).max(80),
  workingDays: z.array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])).min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  expectedDailyHours: z.coerce.number().min(0).max(24),
  breakMinutes: z.coerce.number().int().min(0).max(600),
  flexibleMinutes: z.coerce.number().int().min(0).max(720),
  coreStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  coreEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  overnight: z.boolean().default(false),
  effectiveStartDate: z.string().trim().min(1),
  effectiveEndDate: z.string().trim().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

export const attendanceActionSchema = z.object({
  workMode: z.enum(attendanceWorkModes),
  locationId: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  idempotencyKey: z.string().trim().min(12).max(100),
  verificationState: z.enum(["VERIFIED", "NOT_VERIFIED", "UNAVAILABLE", "NOT_REQUIRED"]).default("NOT_REQUIRED"),
  distanceMetres: z.coerce.number().int().min(0).max(100000).optional(),
});

export const breakActionSchema = z.object({
  breakType: z.enum(["MEAL", "SHORT", "PERSONAL", "MEDICAL", "OTHER"]).default("MEAL"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  idempotencyKey: z.string().trim().min(12).max(100),
});

export const projectTypes = ["CLIENT_IMPLEMENTATION", "INFRASTRUCTURE", "NETWORK_INSTALLATION", "M365_MIGRATION", "CYBERSECURITY", "HARDWARE_DEPLOYMENT", "SOFTWARE_DEPLOYMENT", "CLOUD_MIGRATION", "INTERNAL_IT", "BUSINESS_IMPROVEMENT", "WEBSITE_APPLICATION", "OTHER"] as const;
export const projectStatuses = ["DRAFT", "PLANNING", "AWAITING_APPROVAL", "APPROVED", "ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export const projectPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const projectHealthStates = ["HEALTHY", "MONITOR", "AT_RISK", "CRITICAL", "ON_HOLD", "COMPLETED"] as const;
export const taskStatuses = ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "WAITING", "COMPLETED", "CANCELLED"] as const;
export const taskPriorities = projectPriorities;
export const milestoneStatuses = ["UPCOMING", "AT_RISK", "ACHIEVED", "MISSED", "CANCELLED"] as const;
export const dependencyTypes = ["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"] as const;
export const projectTimeSources = ["MANUAL", "TASK_TIMER", "IMPORTED", "FUTURE_PULSEONE"] as const;
export const projectTimeApprovalStates = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;

export const projectFormSchema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  projectType: z.enum(projectTypes),
  priority: z.enum(projectPriorities),
  clientId: z.string().trim().optional().or(z.literal("")),
  siteId: z.string().trim().optional().or(z.literal("")),
  classification: z.enum(["INTERNAL", "CLIENT"]),
  managerId: z.string().trim().optional().or(z.literal("")),
  ownerId: z.string().trim().optional().or(z.literal("")),
  plannedStartDate: z.string().trim().min(1),
  plannedCompletionDate: z.string().trim().min(1),
  estimatedHours: z.coerce.number().min(0).max(100000),
  billable: z.boolean().default(false),
  billingMethod: z.string().trim().max(80).optional().or(z.literal("")),
  purchaseOrderReference: z.string().trim().max(120).optional().or(z.literal("")),
  contractReference: z.string().trim().max(120).optional().or(z.literal("")),
  healthState: z.enum(projectHealthStates).default("HEALTHY"),
});

export const projectStatusSchema = z.object({
  projectId: z.string().trim().min(1),
  status: z.enum(projectStatuses),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
  completionSummary: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const projectTaskSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  parentTaskId: z.string().trim().optional().or(z.literal("")),
  status: z.enum(taskStatuses).default("TODO"),
  priority: z.enum(taskPriorities).default("MEDIUM"),
  assigneeId: z.string().trim().optional().or(z.literal("")),
  teamId: z.string().trim().optional().or(z.literal("")),
  startDate: z.string().trim().optional().or(z.literal("")),
  dueDate: z.string().trim().optional().or(z.literal("")),
  estimatedHours: z.coerce.number().min(0).max(10000).default(0),
  billable: z.boolean().default(false),
  labels: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const projectTaskStatusSchema = z.object({
  taskId: z.string().trim().min(1),
  status: z.enum(taskStatuses),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const projectMilestoneSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  ownerId: z.string().trim().optional().or(z.literal("")),
  plannedDate: z.string().trim().min(1),
  completionCriteria: z.string().trim().max(3000).optional().or(z.literal("")),
  clientVisible: z.boolean().default(false),
});

export const projectTimeEntrySchema = z.object({
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().optional().or(z.literal("")),
  date: z.string().trim().min(1),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  description: z.string().trim().min(2).max(2000),
  billable: z.boolean().default(false),
  workType: z.string().trim().max(100).optional().or(z.literal("")),
  source: z.enum(projectTimeSources).default("MANUAL"),
});

export const projectTimeDecisionSchema = z.object({
  entryId: z.string().trim().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  rejectionReason: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const projectCommentSchema = z.object({
  projectId: z.string().trim().min(1),
  taskId: z.string().trim().optional().or(z.literal("")),
  body: z.string().trim().min(1).max(5000),
  visibility: z.enum(["INTERNAL", "PROJECT_TEAM", "CLIENT_VISIBLE"]),
  parentCommentId: z.string().trim().optional().or(z.literal("")),
});

export const projectRiskSchema = z.object({
  projectId: z.string().trim().min(1),
  type: z.enum(["RISK", "ISSUE", "DECISION", "DEPENDENCY", "CHANGE_REQUEST"]),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(3000),
  probability: z.enum(["LOW", "MEDIUM", "HIGH"]),
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
  ownerId: z.string().trim().optional().or(z.literal("")),
  mitigationPlan: z.string().trim().max(3000).optional().or(z.literal("")),
  targetResolutionDate: z.string().trim().optional().or(z.literal("")),
});

export const projectDependencySchema = z.object({
  projectId: z.string().trim().min(1),
  predecessorTaskId: z.string().trim().min(1),
  successorTaskId: z.string().trim().min(1),
  dependencyType: z.enum(dependencyTypes),
});
