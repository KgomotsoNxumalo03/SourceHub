import Link from "next/link";
import { UserPlus } from "lucide-react";

import { buttonClassName } from "@/lib/button";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  PageHeader,
  PaginationShell,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, initialsFromName } from "@/lib/utils";
import { listQuerySchema } from "@/lib/validators";

const statusTone: Record<string, "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  INACTIVE: "warning",
  SUSPENDED: "danger",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("users.view");
  const params = listQuerySchema.parse({
    page: Number((await searchParams)?.page ?? 1),
    pageSize: 10,
    search: String((await searchParams)?.search ?? ""),
    status: String((await searchParams)?.status ?? ""),
    role: String((await searchParams)?.role ?? ""),
  });

  const filters = {
    AND: [
      params.search
        ? {
            OR: [
              { firstName: { contains: params.search, mode: "insensitive" as const } },
              { lastName: { contains: params.search, mode: "insensitive" as const } },
              { email: { contains: params.search, mode: "insensitive" as const } },
              { employeeNumber: { contains: params.search, mode: "insensitive" as const } },
            ],
          }
        : {},
      params.status ? { status: params.status as "ACTIVE" | "INACTIVE" | "SUSPENDED" } : {},
      params.role
        ? {
            roles: {
              some: {
                role: {
                  name: params.role,
                },
              },
            },
          }
        : {},
    ],
  };

  const [total, users, roles] = await Promise.all([
    prisma.user.count({ where: filters }),
    prisma.user.findMany({
      where: filters,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const queryParts = new URLSearchParams();
  if (params.search) queryParts.set("search", params.search);
  if (params.status) queryParts.set("status", params.status);
  if (params.role) queryParts.set("role", params.role);
  const query = queryParts.toString();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Search, review, and manage employee and administrator accounts."
        actions={
          actor.permissions.includes("users.create") ? (
            <Link href="/administration/users/new" className={buttonClassName({ variant: "primary" })}>
              <UserPlus className="h-4 w-4" />
              Add user
            </Link>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-4 lg:grid-cols-[1.2fr_0.6fr_0.8fr_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Search</label>
              <Input name="search" defaultValue={params.search} placeholder="Name, email, or employee number" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Status</label>
              <Select name="status" defaultValue={params.status}>
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text">Role</label>
              <Select name="role" defaultValue={params.role}>
                <option value="">All roles</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" variant="secondary" className="w-full">
                Apply
              </Button>
              <Link href="/administration/users" className={buttonClassName({ variant: "ghost" })}>
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No users found"
                description="Adjust the filters or add a new user to get started."
                action={
                  actor.permissions.includes("users.create") ? (
                    <Link href="/administration/users/new" className={buttonClassName({ variant: "primary" })}>
                      Add user
                    </Link>
                  ) : null
                }
              />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>User</TableHeadCell>
                  <TableHeadCell>Employee</TableHeadCell>
                  <TableHeadCell>Department</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Roles</TableHeadCell>
                  <TableHeadCell>Last login</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sourcehub-primary text-sm font-bold text-white">
                          {initialsFromName(user.firstName, user.lastName)}
                        </div>
                        <div>
                          <p className="font-semibold text-sourcehub-text">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{user.employeeNumber}</TableCell>
                    <TableCell>{user.department ?? "—"}</TableCell>
                    <TableCell>
                      <Badge tone={statusTone[user.status]}>{user.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {user.roles.map((assignment) => (
                          <Badge key={assignment.roleId} tone="outline">
                            {assignment.role.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
                    <TableCell>
                      <Link href={`/administration/users/${user.id}`} className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaginationShell page={params.page} totalPages={totalPages} basePath="/administration/users" query={query} />
    </div>
  );
}
