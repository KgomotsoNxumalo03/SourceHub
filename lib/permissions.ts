export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export type CurrentUser = {
  id: string;
  workspaceId?: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  profileImageUrl: string | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{
    id: string;
    name: string;
    description: string | null;
    isSystemRole: boolean;
  }>;
  permissions: string[];
};

export function hasPermission(user: CurrentUser | null | undefined, permission: string) {
  return Boolean(user?.permissions.includes(permission));
}

export function hasRole(user: CurrentUser | null | undefined, role: string) {
  return Boolean(user?.roles.some((entry) => entry.name === role));
}
