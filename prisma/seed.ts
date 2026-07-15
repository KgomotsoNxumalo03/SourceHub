import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const env = {
  DEV_ADMIN_EMAIL: process.env.DEV_ADMIN_EMAIL ?? "admin@sourcehub.local",
  DEV_ADMIN_PASSWORD: process.env.DEV_ADMIN_PASSWORD ?? "SourceHub123!",
  DEV_ADMIN_FIRST_NAME: process.env.DEV_ADMIN_FIRST_NAME ?? "Dev",
  DEV_ADMIN_LAST_NAME: process.env.DEV_ADMIN_LAST_NAME ?? "Administrator",
  DEV_ADMIN_EMPLOYEE_NUMBER: process.env.DEV_ADMIN_EMPLOYEE_NUMBER ?? "SH-0001",
  DEV_ADMIN_JOB_TITLE: process.env.DEV_ADMIN_JOB_TITLE ?? "Platform Administrator",
  DEV_ADMIN_DEPARTMENT: process.env.DEV_ADMIN_DEPARTMENT ?? "IT Operations",
  DEFAULT_COMPANY_NAME: process.env.DEFAULT_COMPANY_NAME ?? "Source IT Services",
  DEFAULT_TRADING_NAME: process.env.DEFAULT_TRADING_NAME ?? "SourceHub",
  DEFAULT_SUPPORT_EMAIL: process.env.DEFAULT_SUPPORT_EMAIL ?? "support@sourceitservices.co.za",
  DEFAULT_CONTACT_NUMBER: process.env.DEFAULT_CONTACT_NUMBER ?? "+27 11 000 0000",
  DEFAULT_WEBSITE: process.env.DEFAULT_WEBSITE ?? "https://sourceitservices.co.za",
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE ?? "Africa/Johannesburg",
  DEFAULT_COUNTRY: process.env.DEFAULT_COUNTRY ?? "South Africa",
  DEFAULT_DATE_FORMAT: process.env.DEFAULT_DATE_FORMAT ?? "dd MMM yyyy",
};

const permissions = [
  { key: "dashboard.view", name: "View dashboard", description: "Access the main dashboard", module: "Dashboard", action: "view" },
  { key: "users.view", name: "View users", description: "List and view user accounts", module: "Users", action: "view" },
  { key: "users.create", name: "Create users", description: "Create new user accounts", module: "Users", action: "create" },
  { key: "users.edit", name: "Edit users", description: "Edit user accounts", module: "Users", action: "edit" },
  { key: "users.deactivate", name: "Deactivate users", description: "Activate or deactivate user accounts", module: "Users", action: "deactivate" },
  { key: "roles.view", name: "View roles", description: "Inspect roles and permissions", module: "Roles", action: "view" },
  { key: "roles.manage", name: "Manage roles", description: "Create and edit roles", module: "Roles", action: "manage" },
  { key: "tickets.view", name: "View tickets", description: "View the ticket queue and ticket history", module: "Tickets", action: "view" },
  { key: "tickets.create", name: "Create tickets", description: "Open new tickets", module: "Tickets", action: "create" },
  { key: "tickets.edit", name: "Edit tickets", description: "Update ticket details and status", module: "Tickets", action: "edit" },
  { key: "tickets.assign", name: "Assign tickets", description: "Assign tickets to technicians", module: "Tickets", action: "assign" },
  { key: "tickets.comment", name: "Comment on tickets", description: "Add public replies and internal notes", module: "Tickets", action: "comment" },
  { key: "tickets.attach", name: "Attach files", description: "Upload attachments to tickets", module: "Tickets", action: "attach" },
  { key: "audit.view", name: "View audit logs", description: "Review audit activity", module: "Audit", action: "view" },
  { key: "settings.view", name: "View settings", description: "Inspect company settings", module: "Settings", action: "view" },
  { key: "settings.manage", name: "Manage settings", description: "Edit company settings", module: "Settings", action: "manage" },
] satisfies Array<{
  key: string;
  name: string;
  description: string;
  module: string;
  action: string;
}>;

const roleDefinitions = [
  {
    name: "Super Administrator",
    description: "Unrestricted access across SourceHub.",
    isSystemRole: true,
    permissions: permissions.map((permission) => permission.key),
  },
  {
    name: "Administrator",
    description: "Manage users, roles, audit logs, and settings.",
    isSystemRole: true,
    permissions: [
      "dashboard.view",
      "users.view",
      "users.create",
      "users.edit",
      "users.deactivate",
      "roles.view",
      "roles.manage",
      "tickets.view",
      "tickets.create",
      "tickets.edit",
      "tickets.assign",
      "tickets.comment",
      "tickets.attach",
      "audit.view",
      "settings.view",
      "settings.manage",
    ],
  },
  {
    name: "Service Desk Manager",
    description: "Coordinate service desk operations and reporting.",
    isSystemRole: true,
    permissions: [
      "dashboard.view",
      "users.view",
      "tickets.view",
      "tickets.create",
      "tickets.edit",
      "tickets.assign",
      "tickets.comment",
      "tickets.attach",
      "audit.view",
    ],
  },
  {
    name: "Technician",
    description: "Operational access for service delivery staff.",
    isSystemRole: true,
    permissions: ["dashboard.view", "tickets.view", "tickets.edit", "tickets.comment", "tickets.attach"],
  },
  {
    name: "Employee",
    description: "Standard employee access.",
    isSystemRole: true,
    permissions: ["dashboard.view", "tickets.create", "tickets.comment", "tickets.attach"],
  },
  {
    name: "Read-Only Auditor",
    description: "Inspect records and audit history without editing.",
    isSystemRole: true,
    permissions: ["dashboard.view", "users.view", "roles.view", "tickets.view", "audit.view", "settings.view"],
  },
] satisfies Array<{
  name: string;
  description: string;
  isSystemRole: boolean;
  permissions: string[];
}>;

async function main() {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: {
        key: permission.key,
        name: permission.name,
        description: permission.description,
        module: permission.module,
        action: permission.action,
      },
      update: {
        name: permission.name,
        description: permission.description,
        module: permission.module,
        action: permission.action,
      },
    });
  }

  const permissionRecords = await prisma.permission.findMany();

  for (const roleDefinition of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { name: roleDefinition.name },
      create: {
        name: roleDefinition.name,
        description: roleDefinition.description,
        isSystemRole: roleDefinition.isSystemRole,
      },
      update: {
        description: roleDefinition.description,
        isSystemRole: roleDefinition.isSystemRole,
      },
    });

    const permissionIds = permissionRecords
      .filter((permission) => roleDefinition.permissions.includes(permission.key))
      .map((permission) => permission.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });
  }

  const passwordHash = await bcrypt.hash(env.DEV_ADMIN_PASSWORD, 12);
  const superAdminRole = await prisma.role.findUnique({
    where: { name: "Super Administrator" },
  });

  if (!superAdminRole) {
    throw new Error("Super Administrator role was not created.");
  }

  const devAdmin = await prisma.user.upsert({
    where: { email: env.DEV_ADMIN_EMAIL.toLowerCase() },
    create: {
      employeeNumber: env.DEV_ADMIN_EMPLOYEE_NUMBER,
      firstName: env.DEV_ADMIN_FIRST_NAME,
      lastName: env.DEV_ADMIN_LAST_NAME,
      email: env.DEV_ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      phone: null,
      jobTitle: env.DEV_ADMIN_JOB_TITLE,
      department: env.DEV_ADMIN_DEPARTMENT,
      profileImageUrl: null,
      status: "ACTIVE",
      roles: {
        create: [{ roleId: superAdminRole.id }],
      },
    },
    update: {
      employeeNumber: env.DEV_ADMIN_EMPLOYEE_NUMBER,
      firstName: env.DEV_ADMIN_FIRST_NAME,
      lastName: env.DEV_ADMIN_LAST_NAME,
      passwordHash,
      jobTitle: env.DEV_ADMIN_JOB_TITLE,
      department: env.DEV_ADMIN_DEPARTMENT,
      status: "ACTIVE",
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: devAdmin.id,
        roleId: superAdminRole.id,
      },
    },
    create: {
      userId: devAdmin.id,
      roleId: superAdminRole.id,
    },
    update: {},
  });

  await prisma.setting.upsert({
    where: { key: "companyProfile.companyName" },
    create: { key: "companyProfile.companyName", value: env.DEFAULT_COMPANY_NAME },
    update: { value: env.DEFAULT_COMPANY_NAME },
  });

  const settings = {
    "companyProfile.companyName": env.DEFAULT_COMPANY_NAME,
    "companyProfile.tradingName": env.DEFAULT_TRADING_NAME,
    "companyProfile.supportEmail": env.DEFAULT_SUPPORT_EMAIL,
    "companyProfile.contactNumber": env.DEFAULT_CONTACT_NUMBER,
    "companyProfile.website": env.DEFAULT_WEBSITE,
    "companyProfile.timezone": env.DEFAULT_TIMEZONE,
    "companyProfile.country": env.DEFAULT_COUNTRY,
    "companyProfile.defaultDateFormat": env.DEFAULT_DATE_FORMAT,
    "branding.displayName": "SourceHub",
    "branding.logoUrl": "",
    "branding.primaryColor": "#0F46B0",
    "branding.secondaryColor": "#11386D",
  } as const;

  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  const categories = [
    { name: "Hardware", description: "Desktops, laptops, peripherals, and device faults", color: "#1D4ED8" },
    { name: "Software", description: "Applications, licensing, and configuration issues", color: "#0F766E" },
    { name: "Access", description: "Passwords, permissions, and account access requests", color: "#7C3AED" },
    { name: "Network", description: "Connectivity, Wi-Fi, VPN, and internet issues", color: "#B45309" },
    { name: "Other", description: "General service desk requests", color: "#475569" },
  ] satisfies Array<{ name: string; description: string; color: string }>;

  for (const category of categories) {
    await prisma.ticketCategory.upsert({
      where: { name: category.name },
      create: {
        name: category.name,
        description: category.description,
        color: category.color,
        isActive: true,
      },
      update: {
        description: category.description,
        color: category.color,
        isActive: true,
      },
    });
  }

  await prisma.ticketSequence.upsert({
    where: { name: "default" },
    create: { name: "default", currentValue: 1 },
    update: {},
  });

  const existingNotifications = await prisma.notification.count({
    where: { userId: devAdmin.id },
  });

  if (existingNotifications === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: devAdmin.id,
          title: "Welcome to SourceHub",
          message: "The Phase 1 foundation is ready for administration and auditing.",
          type: "SUCCESS",
          link: "/dashboard",
        },
        {
          userId: devAdmin.id,
          title: "Seed data configured",
          message: "Development roles, permissions, and settings have been loaded.",
          type: "INFO",
          link: "/administration/roles",
        },
        {
          userId: devAdmin.id,
          title: "Review access controls",
          message: "Audit logs and role management are available in Administration.",
          type: "WARNING",
          link: "/administration/audit-logs",
        },
      ],
    });
  }

  console.log("SourceHub seed complete.");
  console.log(`Development admin: ${env.DEV_ADMIN_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
