"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { userFormSchema } from "@/lib/validators";

function getRoleIds(formData: FormData) {
  return Array.from(new Set(formData.getAll("roleIds").map((value) => String(value).trim()).filter(Boolean)));
}

function errorRedirect(path: string, message: string) {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function getRoleIdByName(name: string) {
  const role = await prisma.role.findUnique({ where: { name } });
  return role?.id ?? null;
}

async function canDeactivateSuperAdmin(userId: string) {
  const superAdminRoleId = await getRoleIdByName("Super Administrator");
  if (!superAdminRoleId) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true },
  });

  const hasSuperAdminRole = user?.roles.some((assignment) => assignment.roleId === superAdminRoleId);
  if (!hasSuperAdminRole) return true;

  const activeSuperAdmins = await prisma.user.count({
    where: {
      status: "ACTIVE",
      roles: {
        some: {
          roleId: superAdminRoleId,
        },
      },
    },
  });

  return activeSuperAdmins > 1;
}

export async function createUserAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("users.create")) {
    redirect("/access-denied");
  }

  const payload = userFormSchema.safeParse({
    employeeNumber: formData.get("employeeNumber"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    jobTitle: formData.get("jobTitle"),
    department: formData.get("department"),
    profileImageUrl: formData.get("profileImageUrl"),
    status: formData.get("status"),
    roleIds: getRoleIds(formData),
    password: formData.get("password"),
  });

  if (!payload.success) {
    errorRedirect("/administration/users/new", payload.error.issues[0]?.message ?? "Please review the user form.");
  }

  const data = payload.data!;

  if (!data.password) {
    errorRedirect("/administration/users/new", "Initial password is required.");
  }

  const password = data.password!;

  const [emailExists, employeeExists] = await Promise.all([
    prisma.user.findUnique({ where: { email: data.email } }),
    prisma.user.findUnique({ where: { employeeNumber: data.employeeNumber } }),
  ]);

  if (emailExists) {
    errorRedirect("/administration/users/new", "A user with that email already exists.");
  }

  if (employeeExists) {
    errorRedirect("/administration/users/new", "A user with that employee number already exists.");
  }

  const roleIds = data.roleIds.length > 0 ? data.roleIds : [];
  const employeeRoleId = await getRoleIdByName("Employee");
  if (roleIds.length === 0 && employeeRoleId) {
    roleIds.push(employeeRoleId);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      employeeNumber: data.employeeNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email.toLowerCase(),
      passwordHash,
      phone: data.phone || null,
      jobTitle: data.jobTitle || null,
      department: data.department || null,
      profileImageUrl: data.profileImageUrl || null,
      status: data.status,
      roles: {
        create: roleIds.map((roleId) => ({
          roleId,
        })),
      },
    },
  });

  await logAudit({
    userId: actor.id,
    action: "users.create",
    entityType: "User",
    entityId: user.id,
    newValues: {
      employeeNumber: user.employeeNumber,
      email: user.email,
      roles: roleIds,
    },
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect("/administration/users?created=1");
}

export async function updateUserAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("users.edit")) {
    redirect("/access-denied");
  }

  const userId = String(formData.get("id") ?? "");
  if (!userId) {
    errorRedirect("/administration/users", "Missing user identifier.");
  }

  const payload = userFormSchema.safeParse({
    employeeNumber: formData.get("employeeNumber"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    jobTitle: formData.get("jobTitle"),
    department: formData.get("department"),
    profileImageUrl: formData.get("profileImageUrl"),
    status: formData.get("status"),
    roleIds: getRoleIds(formData),
    password: "",
  });

  if (!payload.success) {
    errorRedirect(`/administration/users/${userId}`, payload.error.issues[0]?.message ?? "Please review the user form.");
  }

  const data = payload.data!;

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: true,
    },
  });

  if (!existing) {
    errorRedirect("/administration/users", "The selected user no longer exists.");
  }

  const currentUserRecord = existing!;

  if (currentUserRecord.id === actor.id && data.status !== "ACTIVE") {
    errorRedirect(`/administration/users/${userId}`, "You cannot deactivate your own account.");
  }

  if (data.status !== "ACTIVE") {
    const canDeactivate = await canDeactivateSuperAdmin(userId);
    if (!canDeactivate) {
      errorRedirect(`/administration/users/${userId}`, "You cannot deactivate the last active Super Administrator.");
    }
  }

  const roleIds = data.roleIds.length > 0 ? data.roleIds : [];
  if (currentUserRecord.id === actor.id) {
    const existingRoleIds = currentUserRecord.roles.map((assignment) => assignment.roleId).sort().join(",");
    const requestedRoleIds = [...roleIds].sort().join(",");
    if (existingRoleIds !== requestedRoleIds) {
      errorRedirect(`/administration/users/${userId}`, "You cannot assign roles to yourself.");
    }
  }

  const [emailConflict, employeeConflict] = await Promise.all([
    prisma.user.findFirst({
      where: {
        email: data.email.toLowerCase(),
        NOT: { id: userId },
      },
    }),
    prisma.user.findFirst({
      where: {
        employeeNumber: data.employeeNumber,
        NOT: { id: userId },
      },
    }),
  ]);

  if (emailConflict) {
    errorRedirect(`/administration/users/${userId}`, "Another user already uses that email address.");
  }

  if (employeeConflict) {
    errorRedirect(`/administration/users/${userId}`, "Another user already uses that employee number.");
  }

  const previousValues = {
    employeeNumber: currentUserRecord.employeeNumber,
    firstName: currentUserRecord.firstName,
    lastName: currentUserRecord.lastName,
    email: currentUserRecord.email,
    phone: currentUserRecord.phone,
    jobTitle: currentUserRecord.jobTitle,
    department: currentUserRecord.department,
    profileImageUrl: currentUserRecord.profileImageUrl,
    status: currentUserRecord.status,
    roleIds: currentUserRecord.roles.map((assignment) => assignment.roleId),
  };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        employeeNumber: data.employeeNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        jobTitle: data.jobTitle || null,
        department: data.department || null,
        profileImageUrl: data.profileImageUrl || null,
        status: data.status,
      },
    }),
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId })),
    }),
  ]);

  await logAudit({
    userId: actor.id,
    action: "users.update",
    entityType: "User",
    entityId: userId,
    previousValues,
    newValues: {
      ...previousValues,
      employeeNumber: data.employeeNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      jobTitle: data.jobTitle || null,
      department: data.department || null,
      profileImageUrl: data.profileImageUrl || null,
      status: data.status,
      roleIds,
    },
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect(`/administration/users/${userId}?updated=1`);
}

export async function resetUserPasswordAction(formData: FormData) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes("users.edit")) {
    redirect("/access-denied");
  }

  const userId = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!userId) {
    errorRedirect("/administration/users", "Missing user identifier.");
  }

  if (password.length < 12) {
    errorRedirect(`/administration/users/${userId}`, "The new password must be at least 12 characters long.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!target) {
    errorRedirect("/administration/users", "The selected user no longer exists.");
  }

  const targetRecord = target!;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await logAudit({
    userId: actor.id,
    action: "users.password_reset",
    entityType: "User",
    entityId: userId,
    metadata: { email: targetRecord.email, source: "administrator" },
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect(`/administration/users/${userId}?passwordReset=1`);
}
