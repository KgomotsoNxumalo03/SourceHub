export type PermissionCatalogEntry = {
  key: string;
  name: string;
  group: string;
  description: string;
};

export function permissionName(key: string) {
  return key
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function entry(key: string, group: string, description: string): PermissionCatalogEntry {
  return {
    key,
    name: permissionName(key),
    group,
    description,
  };
}

export const permissionCatalog: PermissionCatalogEntry[] = [
  entry("dashboard.view", "dashboard", "View operational dashboard"),
  entry("users.view", "identity", "View employees and administrators"),
  entry("users.create", "identity", "Create user accounts"),
  entry("users.edit", "identity", "Update user accounts and passwords"),
  entry("roles.view", "identity", "View roles and permissions"),
  entry("roles.manage", "identity", "Create and maintain roles"),
  entry("audit.view", "governance", "View audit logs"),
  entry("settings.view", "governance", "View company settings"),
  entry("settings.manage", "governance", "Edit company settings"),
  entry("tickets.view", "service-desk", "View all tickets"),
  entry("tickets.create", "service-desk", "Create tickets"),
  entry("tickets.edit", "service-desk", "Edit tickets"),
  entry("tickets.assign", "service-desk", "Assign tickets"),
  entry("tickets.comment", "service-desk", "Add ticket replies and notes"),
  entry("tickets.attach", "service-desk", "Upload ticket attachments"),
  entry("tickets.note", "service-desk", "Add internal ticket notes"),
  entry("tickets.reply", "service-desk", "Add public ticket replies"),
  entry("tickets.update", "service-desk", "Update core ticket fields"),
  entry("slaPolicies.view", "service-desk", "View SLA policies"),
  entry("slaPolicies.manage", "service-desk", "Create and manage SLA policies"),
  entry("escalations.view", "service-desk", "View escalation history"),
  entry("escalations.manage", "service-desk", "Configure escalation rules"),
  entry("automation.view", "service-desk", "View automation runs"),
  entry("automation.manage", "service-desk", "Manage automations"),
  entry("email.view", "service-desk", "View email processing status"),
  entry("email.manage", "service-desk", "Configure email integration"),
  entry("technicians.view", "service-desk", "View technician workspace"),
  entry("technicians.manage", "service-desk", "Manage technician queues"),
  entry("assets.view", "assets", "View assets"),
  entry("assets.create", "assets", "Create assets"),
  entry("assets.update", "assets", "Update assets"),
  entry("assets.assign", "assets", "Assign assets"),
  entry("assets.transfer", "assets", "Transfer assets"),
  entry("assets.archive", "assets", "Archive assets"),
  entry("assets.retire", "assets", "Retire assets"),
  entry("assets.dispose", "assets", "Dispose assets"),
  entry("assets.import", "assets", "Import assets"),
  entry("assets.export", "assets", "Export assets"),
  entry("assetTypes.manage", "assets", "Manage asset type configuration"),
  entry("asset_files.manage", "assets", "Manage asset files"),
  entry("asset_maintenance.manage", "assets", "Manage maintenance records"),
  entry("asset_software.manage", "assets", "Manage software inventory"),
  entry("asset_licences.view", "assets", "View software licences"),
  entry("asset_licences.manage", "assets", "Manage software licences"),
  entry("asset_financials.view", "assets", "View asset financials"),
  entry("asset_security.view", "assets", "View asset security details"),
  entry("asset_audit.view", "assets", "View asset audit history"),
  entry("clients.view", "crm", "View clients"),
  entry("clients.create", "crm", "Create clients"),
  entry("clients.update", "crm", "Update clients"),
  entry("clients.archive", "crm", "Archive and restore clients"),
  entry("contacts.manage", "crm", "Manage contacts"),
  entry("sites.manage", "crm", "Manage client sites"),
  entry("contracts.view", "crm", "View contracts"),
  entry("contracts.manage", "crm", "Create and manage contracts"),
  entry("support_agreements.manage", "crm", "Manage support agreements"),
  entry("billing.view", "crm", "View billing profiles"),
  entry("billing.manage", "crm", "Manage billing profiles"),
  entry("client_files.manage", "crm", "Upload and manage client files"),
  entry("portal_access.manage", "crm", "Invite and manage portal access"),
  entry("workspaces.manage", "platform", "Manage workspaces and scoping"),
];

export const permissionGroups = Array.from(new Set(permissionCatalog.map((item) => item.group)));
