import "server-only";

import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db";
import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { getSessionToken, hashToken } from "@/lib/session";
import { hasPermission, hasRole, type CurrentUser } from "@/lib/permissions";
import { env } from "@/lib/env";
import { cache } from "react";

async function getSessionRecordByHash(tokenHash: string) {
  const enterpriseSession = await firestoreAdmin.collection(collectionNames.enterpriseSessions).where("tokenHash", "==", tokenHash).limit(1).get();
  if (!enterpriseSession.empty && enterpriseSession.docs[0].data()?.status !== "ACTIVE") return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  return session;
}

async function getSessionRecord() {
  const token = await getSessionToken();
  if (!token) return null;

  const tokenHash = hashToken(token);
  return unstable_cache(
    () => getSessionRecordByHash(tokenHash),
    ["sourcehub-session", tokenHash],
    { revalidate: 10 },
  )();
}

async function resolveCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSessionRecord();
  if (!session) return null;

  const roleMap = new Map<string, CurrentUser["roles"][number]>(
    session.user.roles.map((entry) => [
      entry.role.name,
      {
        id: entry.role.id,
        name: entry.role.name,
        description: entry.role.description,
        isSystemRole: entry.role.isSystemRole,
      },
    ]),
  );

  const permissions = new Set<string>();
  for (const entry of session.user.roles) {
    for (const assignment of entry.role.permissions) {
      permissions.add(assignment.permission.key);
    }
  }

  return {
    id: session.user.id,
    workspaceId: (session.user as any).workspaceId ?? env.DEFAULT_WORKSPACE_ID,
    employeeNumber: session.user.employeeNumber,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    email: session.user.email,
    phone: session.user.phone,
    jobTitle: session.user.jobTitle,
    department: session.user.department,
    profileImageUrl: session.user.profileImageUrl,
    status: session.user.status,
    lastLoginAt: session.user.lastLoginAt,
    createdAt: session.user.createdAt,
    updatedAt: session.user.updatedAt,
    roles: Array.from(roleMap.values()),
    permissions: Array.from(permissions),
  };
}

// Deduplicate the session and role graph lookup across the app layout and page.
export const currentUser = cache(resolveCurrentUser);

export async function requireAuth() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requirePermission(permission: string) {
  const user = await requireAuth();
  if (!hasPermission(user, permission)) {
    redirect("/access-denied");
  }
  return user;
}

export async function requireRole(role: string) {
  const user = await requireAuth();
  if (!hasRole(user, role)) {
    redirect("/access-denied");
  }
  return user;
}
