import Link from "next/link";

import { deleteRoleAction, updateRoleAction } from "@/lib/actions/roles";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, EmptyState, Input, PageHeader } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { formatDateTime } from "@/lib/utils";

export default async function EditRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("roles.manage");
  const { id } = await params;
  const query = (await searchParams) ?? {};

  const [role, permissions] = await Promise.all([
    prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
    }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] }),
  ]);

  if (!role) {
    return (
      <EmptyState
        title="Role not found"
        description="The role you tried to open no longer exists."
        action={<Link href="/administration/roles" className={buttonClassName({ variant: "primary" })}>Back to roles</Link>}
      />
    );
  }

  const modules = Array.from(new Set(permissions.map((permission) => permission.module)));
  const assignedPermissionIds = new Set(role.permissions.map((entry) => entry.permissionId));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title={role.name}
        description="Review role configuration, permissions, and usage."
        actions={
          <Link href="/administration/roles" className={buttonClassName({ variant: "outline" })}>
            Back to roles
          </Link>
        }
      />

      {query.updated ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Role saved successfully.
        </div>
      ) : null}
      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {String(query.error)}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Role details</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateRoleAction} className="space-y-6">
              <input type="hidden" name="id" value={role.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="name">
                    Role name <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="name" name="name" defaultValue={role.name} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">
                    Description
                  </label>
                  <Input id="description" name="description" defaultValue={role.description ?? ""} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-sourcehub-text">Permissions</p>
                <div className="space-y-4">
                  {modules.map((module) => (
                    <div key={module} className="rounded-2xl border border-sourcehub-border bg-sourcehub-muted/30 p-4">
                      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-sourcehub-primary">{module}</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {permissions
                          .filter((permission) => permission.module === module)
                          .map((permission) => (
                            <label key={permission.id} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm">
                              <Checkbox name="permissionIds" value={permission.id} defaultChecked={assignedPermissionIds.has(permission.id)} />
                              <span>
                                <span className="block font-medium text-sourcehub-text">{permission.name}</span>
                                <span className="block text-xs text-slate-500">{permission.key}</span>
                              </span>
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button type="submit">Save role</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Role summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-sourcehub-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Assigned users</p>
                  <p className="mt-1 text-sm font-medium text-sourcehub-text">{role._count.users}</p>
                </div>
                <div className="rounded-2xl bg-sourcehub-muted p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Permission count</p>
                  <p className="mt-1 text-sm font-medium text-sourcehub-text">{role.permissions.length}</p>
                </div>
              </div>
              <Badge tone={role.isSystemRole ? "info" : "outline"}>{role.isSystemRole ? "System role" : "Custom role"}</Badge>
              <p className="text-sm text-slate-600">Updated {formatDateTime(role.updatedAt)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={deleteRoleAction} className="space-y-3">
                <input type="hidden" name="id" value={role.id} />
                <p className="text-sm text-slate-600">
                  {role.isSystemRole
                    ? "System roles cannot be deleted."
                    : "Delete this role only when it is no longer assigned to users."}
                </p>
                <ConfirmSubmitButton
                  type="submit"
                  variant="danger"
                  disabled={role.isSystemRole || role._count.users > 0}
                  confirmMessage={`Delete the role \"${role.name}\"? This cannot be undone.`}
                >
                  Delete role
                </ConfirmSubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
