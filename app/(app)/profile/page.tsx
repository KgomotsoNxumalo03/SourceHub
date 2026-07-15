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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "@/components/ui";
import { changePasswordAction, updateProfileAction } from "@/lib/actions/profile";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, initialsFromName } from "@/lib/utils";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) return null;

  const params = (await searchParams) ?? {};
  const recentActivity = await prisma.auditLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const roleBadges = user.roles.map((role) => role.name);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Profile"
        title="Your account"
        description="Review your profile, update contact details, and change your password."
      />

      {params.updated ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Your profile was updated successfully.
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {String(params.error)}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sourcehub-primary text-2xl font-bold text-white">
                {initialsFromName(user.firstName, user.lastName)}
              </div>
              <div>
                <p className="text-xl font-semibold text-sourcehub-text">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-sm text-slate-600">{user.email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {roleBadges.map((role) => (
                    <Badge key={role} tone="info">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-sourcehub-muted p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Employee number</p>
                <p className="mt-1 text-sm font-medium text-sourcehub-text">{user.employeeNumber}</p>
              </div>
              <div className="rounded-2xl bg-sourcehub-muted p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Last login</p>
                <p className="mt-1 text-sm font-medium text-sourcehub-text">{formatDateTime(user.lastLoginAt)}</p>
              </div>
            </div>

            <form action={updateProfileAction} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium text-sourcehub-text">
                  Phone number
                </label>
                <Input id="phone" name="phone" defaultValue={user.phone ?? ""} placeholder="+27 11 000 0000" />
              </div>
              <div className="space-y-2">
                <label htmlFor="profileImageUrl" className="text-sm font-medium text-sourcehub-text">
                  Profile image URL
                </label>
                <Input
                  id="profileImageUrl"
                  name="profileImageUrl"
                  defaultValue={user.profileImageUrl ?? ""}
                  placeholder="https://..."
                />
              </div>
              <Button type="submit">Save profile</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={changePasswordAction} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="currentPassword" className="text-sm font-medium text-sourcehub-text">
                    Current password <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="currentPassword" name="currentPassword" type="password" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="newPassword" className="text-sm font-medium text-sourcehub-text">
                    New password <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="newPassword" name="newPassword" type="password" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-sourcehub-text">
                    Confirm new password <span className="text-sourcehub-primary">*</span>
                  </label>
                  <Input id="confirmPassword" name="confirmPassword" type="password" required />
                </div>
                <Button type="submit" variant="secondary">
                  Update password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent account activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentActivity.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No recent activity"
                    description="Your profile activity will appear here once you start updating your account."
                  />
                </div>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>Action</TableHeadCell>
                      <TableHeadCell>When</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentActivity.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.action}</TableCell>
                        <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
