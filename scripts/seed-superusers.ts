import bcrypt from "bcryptjs";

import { db } from "../lib/db";

const superusers = [
  { email: "kg@sourcehub.local", password: "SourceHubKG123!", firstName: "KG", lastName: "Administrator", employeeNumber: "SH-0002" },
  { email: "gareth@sourcehub.local", password: "SourceHubGareth123!", firstName: "Gareth", lastName: "Administrator", employeeNumber: "SH-0003" },
] as const;

const permissionKeys = [
  "dashboard.view",
  "users.view", "users.create", "users.edit",
  "roles.view", "roles.manage",
  "audit.view",
  "settings.view", "settings.manage",
  "tickets.view", "tickets.create", "tickets.edit", "tickets.assign",
  "tickets.comment", "tickets.attach", "tickets.note", "tickets.reply", "tickets.update",
] as const;

function permissionName(key: string) {
  return key.split(".").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

async function main() {
  let role = await db.role.findUnique({ where: { name: "Super Administrator" } });
  if (!role) {
    role = await db.role.create({
      data: { name: "Super Administrator", description: "Full platform access", isSystemRole: true },
    });
  }

  for (const key of permissionKeys) {
    let permission = await db.permission.findUnique({ where: { key } });
    if (!permission) {
      permission = await db.permission.create({
        data: { key, name: permissionName(key), description: null, group: key.split(".")[0] },
      });
    }
    const assignment = await db.rolePermission.findFirst({
      where: { roleId: role.id, permissionId: permission.id },
    });
    if (!assignment) {
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
  }

  for (const account of superusers) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    const existing = await db.user.findUnique({ where: { email: account.email } });
    const data = {
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      employeeNumber: account.employeeNumber,
      passwordHash,
      phone: null,
      jobTitle: "Platform Administrator",
      department: "IT Operations",
      profileImageUrl: null,
      status: "ACTIVE",
    };
    const user = existing
      ? await db.user.update({ where: { id: existing.id }, data })
      : await db.user.create({ data });

    const assignment = await db.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
    if (!assignment) await db.userRole.create({ data: { userId: user.id, roleId: role.id } });

    if (!(await bcrypt.compare(account.password, user.passwordHash))) {
      throw new Error(`Password verification failed for ${account.email}.`);
    }
    console.log(`Seeded ${account.email} as a Super Administrator.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
