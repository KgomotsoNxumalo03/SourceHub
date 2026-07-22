import bcrypt from "bcryptjs";

import { env } from "../lib/env.ts";
import { firestoreAdmin } from "../lib/db.ts";
import { permissionCatalog } from "../lib/permission-catalog.ts";
import { collectionNames } from "../lib/collections.ts";

const roleBlueprints = [
  {
    name: "Super Administrator",
    description: "Full platform access",
    isSystemRole: true,
    permissions: permissionCatalog.map((permission) => permission.key),
  },
  {
    name: "Service Desk Manager",
    description: "Manages tickets, SLAs, and escalation workflows",
    isSystemRole: true,
    permissions: [
      "dashboard.view",
      "tickets.view",
      "tickets.create",
      "tickets.edit",
      "tickets.assign",
      "tickets.comment",
      "tickets.attach",
      "tickets.note",
      "tickets.reply",
      "tickets.update",
      "slaPolicies.view",
      "slaPolicies.manage",
      "escalations.view",
      "escalations.manage",
      "automation.view",
      "automation.manage",
      "automations.view",
      "automations.create",
      "automations.update",
      "automations.review",
      "automations.publish",
      "automations.activate",
      "automations.pause",
      "automations.archive",
      "automations.execute",
      "automations.cancel",
      "automations.retry",
      "automations.approve",
      "automations.templates.manage",
      "automations.webhooks.manage",
      "automations.monitor.view",
      "automations.audit.view",
      "automations.high_risk.approve",
      "email.view",
      "email.manage",
      "technicians.view",
      "technicians.manage",
      "ai.use",
      "ai.tickets.use",
      "ai.knowledge.use",
      "ai.reports.use",
      "ai.actions.propose",
      "ai.actions.confirm",
    ],
  },
  {
    name: "Technician",
    description: "Owns and resolves tickets",
    isSystemRole: true,
    permissions: [
      "dashboard.view",
      "tickets.view",
      "tickets.edit",
      "tickets.assign",
      "tickets.comment",
      "tickets.attach",
      "tickets.note",
      "tickets.reply",
      "tickets.update",
      "technicians.view",
      "ai.use",
      "ai.tickets.use",
      "ai.knowledge.use",
      "ai.actions.propose",
    ],
  },
  {
    name: "CRM Manager",
    description: "Manages clients, agreements, and portal access",
    isSystemRole: true,
    permissions: [
      "dashboard.view",
      "clients.view",
      "clients.create",
      "clients.update",
      "clients.archive",
      "contacts.manage",
      "sites.manage",
      "contracts.view",
      "contracts.manage",
      "support_agreements.manage",
      "billing.view",
      "billing.manage",
      "client_files.manage",
      "portal_access.manage",
      "ai.use",
      "ai.clients.use",
      "ai.knowledge.use",
      "ai.reports.use",
      "ai.actions.propose",
    ],
  },
  {
    name: "Employee",
    description: "Standard internal employee access",
    isSystemRole: true,
    permissions: [
      "dashboard.view",
      "tickets.view",
      "tickets.create",
      "tickets.comment",
      "tickets.reply",
    ],
  },
];

const accounts = [
  {
    email: env.DEV_ADMIN_EMAIL,
    password: env.DEV_ADMIN_PASSWORD,
    firstName: env.DEV_ADMIN_FIRST_NAME,
    lastName: env.DEV_ADMIN_LAST_NAME,
    employeeNumber: env.DEV_ADMIN_EMPLOYEE_NUMBER,
    jobTitle: env.DEV_ADMIN_JOB_TITLE,
    department: env.DEV_ADMIN_DEPARTMENT,
    roleName: "Super Administrator",
  },
  {
    email: "kg@sourcehub.local",
    password: "SourceHubKG123!",
    firstName: "KG",
    lastName: "Administrator",
    employeeNumber: "SH-0002",
    jobTitle: "Platform Administrator",
    department: "IT Operations",
    roleName: "Super Administrator",
  },
  {
    email: "gareth@sourcehub.local",
    password: "SourceHubGareth123!",
    firstName: "Gareth",
    lastName: "Administrator",
    employeeNumber: "SH-0003",
    jobTitle: "Platform Administrator",
    department: "IT Operations",
    roleName: "Super Administrator",
  },
];

function permissionName(key: string) {
  return key
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function ensureWorkspace() {
  await firestoreAdmin.collection(collectionNames.workspaces).doc(env.DEFAULT_WORKSPACE_ID).set(
    {
      id: env.DEFAULT_WORKSPACE_ID,
      name: env.DEFAULT_WORKSPACE_NAME,
      companyName: env.DEFAULT_COMPANY_NAME,
      tradingName: env.DEFAULT_TRADING_NAME,
      supportEmail: env.DEFAULT_SUPPORT_EMAIL,
      contactNumber: env.DEFAULT_CONTACT_NUMBER,
      website: env.DEFAULT_WEBSITE,
      timezone: env.DEFAULT_TIMEZONE,
      country: env.DEFAULT_COUNTRY,
      defaultDateFormat: env.DEFAULT_DATE_FORMAT,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true },
  );
}

async function ensurePermission(key: string) {
  const existing = await firestoreAdmin.collection(collectionNames.permissions).where("key", "==", key).limit(1).get();
  if (!existing.empty) return existing.docs[0]!.id;

  const doc = firestoreAdmin.collection(collectionNames.permissions).doc();
  await doc.set({
    key,
    name: permissionName(key),
    group: key.split(".")[0],
    description: permissionCatalog.find((item) => item.key === key)?.description ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return doc.id;
}

async function ensureRole(name: string, description: string, isSystemRole: boolean) {
  const existing = await firestoreAdmin.collection(collectionNames.roles).where("name", "==", name).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0]!;
    await doc.ref.set({ description, isSystemRole, updatedAt: new Date() }, { merge: true });
    return doc.id;
  }

  const doc = firestoreAdmin.collection(collectionNames.roles).doc();
  await doc.set({
    name,
    description,
    isSystemRole,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return doc.id;
}

async function ensureRolePermission(roleId: string, permissionId: string) {
  const existing = await firestoreAdmin
    .collection(collectionNames.rolePermissions)
    .where("roleId", "==", roleId)
    .where("permissionId", "==", permissionId)
    .limit(1)
    .get();

  if (!existing.empty) return;

  await firestoreAdmin.collection(collectionNames.rolePermissions).add({
    roleId,
    permissionId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function ensureUserRole(userId: string, roleId: string) {
  const existing = await firestoreAdmin
    .collection(collectionNames.userRoles)
    .where("userId", "==", userId)
    .where("roleId", "==", roleId)
    .limit(1)
    .get();

  if (!existing.empty) return;

  await firestoreAdmin.collection(collectionNames.userRoles).add({
    userId,
    roleId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function ensureUser(account: (typeof accounts)[number], roleId: string) {
  const passwordHash = await bcrypt.hash(account.password, 12);
  const existing = await firestoreAdmin.collection(collectionNames.users).where("email", "==", account.email.toLowerCase()).limit(1).get();
  const payload = {
    workspaceId: env.DEFAULT_WORKSPACE_ID,
    employeeNumber: account.employeeNumber,
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email.toLowerCase(),
    passwordHash,
    phone: null,
    jobTitle: account.jobTitle,
    department: account.department,
    profileImageUrl: null,
    status: "ACTIVE",
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let userId = existing.empty ? null : existing.docs[0]!.id;
  if (userId) {
    await firestoreAdmin.collection(collectionNames.users).doc(userId).set(payload, { merge: true });
  } else {
    const doc = firestoreAdmin.collection(collectionNames.users).doc();
    userId = doc.id;
    await doc.set(payload);
  }

  await ensureUserRole(userId, roleId);

  const refreshed = await firestoreAdmin.collection(collectionNames.users).doc(userId).get();
  const hash = refreshed.get("passwordHash");
  if (!(await bcrypt.compare(account.password, hash))) {
    throw new Error(`Password verification failed for ${account.email}.`);
  }

  console.log(`Seeded ${account.email} as a ${account.roleName}.`);
}

async function main() {
  await ensureWorkspace();

  const permissionIds = new Map<string, string>();
  for (const permission of permissionCatalog) {
    permissionIds.set(permission.key, await ensurePermission(permission.key));
  }

  const roleIds = new Map<string, string>();
  for (const role of roleBlueprints) {
    const roleId = await ensureRole(role.name, role.description, role.isSystemRole);
    roleIds.set(role.name, roleId);
    for (const key of role.permissions) {
      const permissionId = permissionIds.get(key);
      if (permissionId) {
        await ensureRolePermission(roleId, permissionId);
      }
    }
  }

  for (const account of accounts) {
    const roleId = roleIds.get(account.roleName);
    if (!roleId) {
      throw new Error(`Missing role ${account.roleName}`);
    }
    await ensureUser(account, roleId);
  }

  console.log("Seeded SourceHub roles, permissions, workspace, and development admin users.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
