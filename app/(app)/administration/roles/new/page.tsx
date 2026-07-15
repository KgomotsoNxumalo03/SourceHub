import Link from "next/link";

import { createRoleAction } from "@/lib/actions/roles";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, PageHeader } from "@/components/ui";

export default async function NewRolePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("roles.manage");
  const params = (await searchParams) ?? {};
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
  const modules = Array.from(new Set(permissions.map((permission) => permission.module)));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Add role"
        description="Create a custom role and attach the permissions it needs."
        actions={
          <Link href="/administration/roles" className={buttonClassName({ variant: "outline" })}>
            Back to roles
          </Link>
        }
      />

      {params.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {String(params.error)}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Role details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createRoleAction} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="name">
                  Role name <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">
                  Description
                </label>
                <Input id="description" name="description" />
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
                            <Checkbox name="permissionIds" value={permission.id} />
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
            <Button type="submit">Create role</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
