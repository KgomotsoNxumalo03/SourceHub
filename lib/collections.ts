export const collectionNames = {
  workspaces: "workspaces",
  users: "users",
  roles: "roles",
  permissions: "permissions",
  userRoles: "userRoles",
  rolePermissions: "rolePermissions",
  sessions: "sessions",
  auditLogs: "auditLogs",
  notifications: "notifications",
  settings: "settings",
  employees: "employees",
  tickets: "tickets",
  ticketCategories: "ticketCategories",
  ticketSequences: "ticketSequences",
  ticketComments: "ticketComments",
  ticketAttachments: "ticketAttachments",
  ticketHistory: "ticketHistory",
  slaPolicies: "slaPolicies",
  slaEvents: "slaEvents",
  escalations: "escalations",
  escalationExecutions: "escalationExecutions",
  automationRules: "automationRules",
  automationExecutions: "automationExecutions",
  emailMessages: "emailMessages",
  emailAttachments: "emailAttachments",
  emailRetries: "emailRetries",
  assets: "assets",
  assetTypes: "assetTypes",
  assetAssignments: "assetAssignments",
  assetEvents: "assetEvents",
  assetSoftware: "assetSoftware",
  softwareCatalog: "softwareCatalog",
  softwareLicences: "softwareLicences",
  licenceAssignments: "licenceAssignments",
  assetMaintenance: "assetMaintenance",
  assetWarranties: "assetWarranties",
  assetFiles: "assetFiles",
  assetImports: "assetImports",
  assetTagCounters: "assetTagCounters",
  assetHealthSnapshots: "assetHealthSnapshots",
  clients: "clients",
  clientContacts: "clientContacts",
  clientSites: "clientSites",
  contracts: "contracts",
  supportAgreements: "supportAgreements",
  billingProfiles: "billingProfiles",
  clientNotes: "clientNotes",
  clientFiles: "clientFiles",
  portalInvitations: "portalInvitations",
  portalAccounts: "portalAccounts",
  businessHours: "businessHours",
  publicHolidays: "publicHolidays",
  technicianQueues: "technicianQueues",
} as const;

export type CollectionName = (typeof collectionNames)[keyof typeof collectionNames];

export function workspaceCollectionPath(workspaceId: string, collection: string) {
  return `workspaces/${workspaceId}/${collection}`;
}

export function workspaceClientPath(workspaceId: string, clientId: string) {
  return `workspaces/${workspaceId}/clients/${clientId}`;
}

export function clientFileStoragePath(workspaceId: string, clientId: string, fileName: string) {
  return `${workspaceClientPath(workspaceId, clientId)}/files/${fileName}`;
}

export function ticketFileStoragePath(workspaceId: string, ticketReference: string, fileName: string) {
  return `workspaces/${workspaceId}/tickets/${ticketReference}/files/${fileName}`;
}
