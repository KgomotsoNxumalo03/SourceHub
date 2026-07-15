import Link from "next/link";

import { buttonClassName } from "@/lib/button";
import { Button, Badge, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, PageHeader, Select, EmptyState } from "@/components/ui";
import { resetUserPasswordAction, updateUserAction } from "@/lib/actions/users";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, initialsFromName } from "@/lib/utils";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("users.edit");
  const { id } = await params;
  const query = (await searchParams) ?? {};

  const [user, roles] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!user) {
    return (
      <EmptyState
        title="User not found"
        description="The user you tried to open no longer exists."
        action={<Link href="/administration/users" className={buttonClassName({ variant: "primary" })}>Back to users</Link>}
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title={`${user.firstName} ${user.lastName}`}
        description="Review account details, update roles, or reset the password."
        actions={
          <Link href="/administration/users" className={buttonClassName({ variant: "outline" })}>
            Back to users
          </Link>
        }
      />

      {query.updated ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          User details saved successfully.
        </div>
      ) : null}
      {query.passwordReset ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Password reset successfully.
        </div>
      ) : null}
      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {String(query.error)}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Account profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sourcehub-primary text-xl font-bold text-white">
                {initialsFromName(user.firstName, user.lastName)}
              </div>
              <div>
                <p className="text-xl font-semibold text-sourcehub-text">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-sm text-slate-600">{user.email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={user.status === "ACTIVE" ? "success" : user.status === "SUSPENDED" ? "danger" : "warning"}>
                    {user.status}
                  </Badge>
                  <Badge tone="outline">{user.employeeNumber}</Badge>
                </div>
              </div>
            </div>

            <form action={updateUserAction} className="space-y-6">
              <input type="hidden" name="id" value={user.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="employeeNumber">
                    Employee number <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="employeeNumber" name="employeeNumber" defaultValue={user.employeeNumber} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="email">
                    Email <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="email" name="email" type="email" defaultValue={user.email} required />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="firstName">
                    First name <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="firstName" name="firstName" defaultValue={user.firstName} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="lastName">
                    Last name <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="lastName" name="lastName" defaultValue={user.lastName} required />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="phone">
                    Phone
                  </label>
                  <Input id="phone" name="phone" defaultValue={user.phone ?? ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="jobTitle">
                    Job title
                  </label>
                  <Input id="jobTitle" name="jobTitle" defaultValue={user.jobTitle ?? ""} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="department">
                    Department
                  </label>
                  <Input id="department" name="department" defaultValue={user.department ?? ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="profileImageUrl">
                    Profile image URL
                  </label>
                  <Input id="profileImageUrl" name="profileImageUrl" type="url" defaultValue={user.profileImageUrl ?? ""} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="status">
                    Status <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Select
                    id="status"
                    name="status"
                    defaultValue={user.status}
                    disabled={user.id === actor.id}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="SUSPENDED">Suspended</option>
                  </Select>
                  {user.id === actor.id ? <input type="hidden" name="status" value={user.status} /> : null}
                  {user.id === actor.id ? (
                    <p className="text-xs text-slate-500">You cannot deactivate your own account.</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-sourcehub-text">Employee profile</p>
                  <div className="rounded-2xl bg-sourcehub-muted p-3 text-sm text-slate-600">
                    Created {formatDateTime(user.createdAt)}
                    <br />
                    Last updated {formatDateTime(user.updatedAt)}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium text-sourcehub-text">Roles</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {roles.map((role) => {
                    const checked = user.roles.some((assignment) => assignment.roleId === role.id);
                    return (
                      <label key={role.id} className="flex items-center gap-3 rounded-2xl border border-sourcehub-border bg-sourcehub-muted/40 px-4 py-3 text-sm">
                        <Checkbox name="roleIds" value={role.id} defaultChecked={checked} disabled={user.id === actor.id} />
                        <span className="font-medium text-sourcehub-text">{role.name}</span>
                      </label>
                    );
                  })}
                </div>
                {user.id === actor.id
                  ? user.roles.map((assignment) => (
                      <input key={assignment.roleId} type="hidden" name="roleIds" value={assignment.roleId} />
                    ))
                  : null}
                {user.id === actor.id ? (
                  <p className="text-xs text-slate-500">Role changes for your own account are blocked.</p>
                ) : null}
              </div>
              <Button type="submit">Save changes</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Reset password</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={resetUserPasswordAction} className="space-y-4">
                <input type="hidden" name="id" value={user.id} />
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="password">
                    New password <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="password" name="password" type="password" minLength={12} required />
                </div>
                <Button type="submit" variant="secondary">
                  Reset password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assigned roles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {user.roles.map((assignment) => (
                <div key={assignment.roleId} className="flex items-center justify-between rounded-2xl border border-sourcehub-border px-4 py-3">
                  <div>
                    <p className="font-medium text-sourcehub-text">{assignment.role.name}</p>
                    <p className="text-xs text-slate-500">{assignment.role.description ?? "No description"}</p>
                  </div>
                  {assignment.role.isSystemRole ? <Badge tone="outline">System</Badge> : <Badge tone="info">Custom</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent user activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {user.auditLogs.length === 0 ? (
                <EmptyState
                  title="No recent activity"
                  description="Activity for this user will appear here after administrators make changes."
                />
              ) : (
                user.auditLogs.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-sourcehub-border px-4 py-3">
                    <p className="text-sm font-medium text-sourcehub-text">{entry.action}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-400">{formatDateTime(entry.createdAt)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
