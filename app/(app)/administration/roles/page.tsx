import Link from "next/link";

import { buttonClassName } from "@/lib/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export default async function RolesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("roles.view");
  const params = (await searchParams) ?? {};

  const [roles, totalUsers] = await Promise.all([
    prisma.role.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { users: true, permissions: true },
        },
      },
    }),
    prisma.user.count(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Roles"
        description="Manage database-driven access roles and the permissions they carry."
        actions={
          actor.permissions.includes("roles.manage") ? (
            <Link href="/administration/roles/new" className={buttonClassName({ variant: "primary" })}>
              Add role
            </Link>
          ) : null
        }
      />

      {params.created ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Role created successfully.
        </div>
      ) : null}
      {params.deleted ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Role deleted successfully.
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {roles.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No roles" description="Create a custom role to begin shaping access for SourceHub." />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Role</TableHeadCell>
                  <TableHeadCell>Description</TableHeadCell>
                  <TableHeadCell>Users</TableHeadCell>
                  <TableHeadCell>Permissions</TableHeadCell>
                  <TableHeadCell>Type</TableHeadCell>
                  <TableHeadCell>Updated</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium text-sourcehub-text">{role.name}</TableCell>
                    <TableCell>{role.description ?? "—"}</TableCell>
                    <TableCell>{role._count.users}</TableCell>
                    <TableCell>{role._count.permissions}</TableCell>
                    <TableCell>
                      <Badge tone={role.isSystemRole ? "info" : "outline"}>{role.isSystemRole ? "System" : "Custom"}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(role.updatedAt)}</TableCell>
                    <TableCell>
                      <Link href={`/administration/roles/${role.id}`} className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
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
    </div>
  );
}
