import Link from "next/link";

import { createUserAction } from "@/lib/actions/users";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, PageHeader, Select } from "@/components/ui";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("users.create");
  const params = (await searchParams) ?? {};
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Add user"
        description="Create a new account and assign the correct starting roles."
        actions={
          <Link href="/administration/users" className={buttonClassName({ variant: "outline" })}>
            Back to users
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
          <CardTitle>User details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createUserAction} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="employeeNumber">
                  Employee number <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="employeeNumber" name="employeeNumber" required placeholder="SH-0100" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="email">
                  Email <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="email" name="email" type="email" required placeholder="name@sourcehub.local" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="firstName">
                  First name <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="firstName" name="firstName" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="lastName">
                  Last name <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="lastName" name="lastName" required />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="phone">
                  Phone
                </label>
                <Input id="phone" name="phone" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="jobTitle">
                  Job title
                </label>
                <Input id="jobTitle" name="jobTitle" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="department">
                  Department
                </label>
                <Input id="department" name="department" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="profileImageUrl">
                  Profile image URL
                </label>
                <Input id="profileImageUrl" name="profileImageUrl" type="url" placeholder="https://..." />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="status">
                  Status <span className="text-sourcehub-primary">*</span>
                </label>
                <Select id="status" name="status" defaultValue="ACTIVE">
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="SUSPENDED">Suspended</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="password">
                  Initial password <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="password" name="password" type="password" required minLength={12} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-sourcehub-text">Roles</p>
              <div className="grid gap-3 md:grid-cols-2">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-3 rounded-2xl border border-sourcehub-border bg-sourcehub-muted/40 px-4 py-3 text-sm">
                    <Checkbox name="roleIds" value={role.id} />
                    <span className="font-medium text-sourcehub-text">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit">Create user</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
