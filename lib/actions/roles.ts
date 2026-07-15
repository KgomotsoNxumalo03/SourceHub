"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { roleFormSchema } from "@/lib/validators";

function getPermissionIds(formData: FormData) {
  return Array.from(new Set(formData.getAll("permissionIds").map((value) => String(value).trim()).filter(Boolean)));
}

function errorRedirect(path: string, message: string) {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createRoleAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("roles.manage")) {
    redirect("/access-denied");
  }

  const payload = roleFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    isSystemRole: false,
    permissionIds: getPermissionIds(formData),
  });

  if (!payload.success) {
    errorRedirect("/administration/roles/new", payload.error.issues[0]?.message ?? "Please review the role form.");
  }

  const data = payload.data!;

  const existing = await prisma.role.findUnique({ where: { name: data.name } });
  if (existing) {
    errorRedirect("/administration/roles/new", "A role with that name already exists.");
  }

  const role = await prisma.role.create({
    data: {
      name: data.name,
      description: data.description || null,
      isSystemRole: false,
      permissions: {
        create: data.permissionIds.map((permissionId) => ({ permissionId })),
      },
    },
  });

  await logAudit({
    userId: actor.id,
    action: "roles.create",
    entityType: "Role",
    entityId: role.id,
    newValues: {
      name: role.name,
      description: role.description,
      permissionIds: data.permissionIds,
    },
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect("/administration/roles?created=1");
}

export async function updateRoleAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("roles.manage")) {
    redirect("/access-denied");
  }

  const roleId = String(formData.get("id") ?? "");
  if (!roleId) {
    errorRedirect("/administration/roles", "Missing role identifier.");
  }

  const payload = roleFormSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    isSystemRole: false,
    permissionIds: getPermissionIds(formData),
  });

  if (!payload.success) {
    errorRedirect(`/administration/roles/${roleId}`, payload.error.issues[0]?.message ?? "Please review the role form.");
  }

  const data = payload.data!;

  const nameConflict = await prisma.role.findFirst({
    where: {
      name: data.name,
      NOT: { id: roleId },
    },
  });

  if (nameConflict) {
    errorRedirect(`/administration/roles/${roleId}`, "Another role already uses that name.");
  }

  const existing = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: true, _count: { select: { users: true } } },
  });

  if (!existing) {
    errorRedirect("/administration/roles", "The selected role no longer exists.");
  }

  const currentRole = existing!;

  await prisma.$transaction([
    prisma.role.update({
      where: { id: roleId },
      data: {
        name: data.name,
        description: data.description || null,
      },
    }),
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: data.permissionIds.map((permissionId) => ({ roleId, permissionId })),
    }),
  ]);

  await logAudit({
    userId: actor.id,
    action: "roles.update",
    entityType: "Role",
    entityId: roleId,
    previousValues: {
      name: currentRole.name,
      description: currentRole.description,
      permissionIds: currentRole.permissions.map((entry) => entry.permissionId),
    },
    newValues: {
      name: data.name,
      description: data.description || null,
      permissionIds: data.permissionIds,
    },
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect(`/administration/roles/${roleId}?updated=1`);
}

export async function deleteRoleAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("roles.manage")) {
    redirect("/access-denied");
  }

  const roleId = String(formData.get("id") ?? "");
  if (!roleId) {
    errorRedirect("/administration/roles", "Missing role identifier.");
  }

  const existing = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  });

  if (!existing) {
    errorRedirect("/administration/roles", "The selected role no longer exists.");
  }

  const currentRole = existing!;

  if (currentRole.isSystemRole) {
    errorRedirect(`/administration/roles/${roleId}`, "System roles cannot be deleted.");
  }

  if (currentRole._count.users > 0) {
    errorRedirect(`/administration/roles/${roleId}`, "You cannot delete a role that is assigned to users.");
  }

  await prisma.role.delete({ where: { id: roleId } });

  await logAudit({
    userId: actor.id,
    action: "roles.delete",
    entityType: "Role",
    entityId: roleId,
    previousValues: {
      name: currentRole.name,
      description: currentRole.description,
      isSystemRole: currentRole.isSystemRole,
    },
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect("/administration/roles?deleted=1");
}
