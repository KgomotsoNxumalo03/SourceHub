import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Boxes, Ticket, Users, Sparkles, ShieldCheck, Activity } from "lucide-react";

import { buttonClassName } from "@/lib/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard";
import { hasPermission } from "@/lib/permissions";
import { formatDate, formatDateTime, initialsFromName } from "@/lib/utils";

function formatActionLabel(action: string) {
  return action
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");

  const summary = await getDashboardSummary(user);

  const currentDate = formatDate(new Date());

  const implementationStatus = [
    {
      label: "Phase 1",
      state: "Completed",
      tone: "success" as const,
      detail: "Authentication, users, roles, audit logging, notifications, and settings",
    },
    {
      label: "Phase 2",
      state: "Upcoming",
      tone: "warning" as const,
      detail: "Service desk tickets, queues, attachments, and history",
    },
    {
      label: "Phase 3",
      state: "Upcoming",
      tone: "warning" as const,
      detail: "Client management and relationship tracking",
    },
    {
      label: "Phase 4",
      state: "Upcoming",
      tone: "warning" as const,
      detail: "Asset inventory and lifecycle management",
    },
    {
      label: "Phase 5",
      state: "Upcoming",
      tone: "warning" as const,
      detail: "Employee tooling and broader operational workflows",
    },
  ];

  const platformCards = [
    {
      label: "Open Tickets",
      value: "Coming in Phase 2",
      hint: "Ticketing is intentionally deferred until the next delivery phase.",
      icon: <Ticket className="h-5 w-5" />,
    },
    {
      label: "Active Clients",
      value: "Coming in Phase 4",
      hint: "Client management will be introduced after the core platform stabilises.",
      icon: <BriefcaseBusiness className="h-5 w-5" />,
    },
    {
      label: "Managed Assets",
      value: "Coming in Phase 5",
      hint: "Asset tracking is planned for a later rollout.",
      icon: <Boxes className="h-5 w-5" />,
    },
    {
      label: "Active Employees",
      value: summary.activeEmployees.toLocaleString(),
      hint: "Real count from the database.",
      icon: <Users className="h-5 w-5" />,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${user.firstName}`}
        description={`Today is ${currentDate}. SourceHub is focused on the Phase 1 foundation while the roadmap stays clearly staged.`}
        actions={
          <Badge tone="info" className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
            Active session
          </Badge>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {platformCards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} icon={card.icon} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Quick actions</CardTitle>
                <p className="mt-1 text-sm text-slate-600">Useful shortcuts for the day-to-day administration workflow.</p>
              </div>
              <Sparkles className="h-5 w-5 text-sourcehub-primary" />
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {hasPermission(user, "users.create") ? (
                <Link href="/administration/users/new" className={buttonClassName({ variant: "primary", className: "w-full" })}>
                  Add employee
                </Link>
              ) : (
                <div className={buttonClassName({ variant: "primary", className: "w-full opacity-50 pointer-events-none" })}>
                  Add employee
                </div>
              )}

              <Link href="/administration/users" className={buttonClassName({ variant: "outline", className: "w-full" })}>
                Manage users
              </Link>

              {hasPermission(user, "audit.view") ? (
                <Link href="/administration/audit-logs" className={buttonClassName({ variant: "outline", className: "w-full sm:col-span-2" })}>
                  View audit activity
                </Link>
              ) : (
                <div className={buttonClassName({ variant: "outline", className: "w-full sm:col-span-2 opacity-50 pointer-events-none" })}>
                  View audit activity
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SourceHub implementation status</CardTitle>
              <p className="mt-1 text-sm text-slate-600">A concise view of what is live now and what is planned next.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {implementationStatus.map((item) => (
                <div key={item.label} className="rounded-2xl border border-sourcehub-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sourcehub-text">{item.label}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                    </div>
                    <Badge tone={item.tone}>{item.state}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent platform activity</CardTitle>
              <p className="mt-1 text-sm text-slate-600">Recent audit trail entries from the SourceHub foundation.</p>
            </div>
            <Activity className="h-5 w-5 text-sourcehub-primary" />
          </CardHeader>
          <CardContent className="p-0">
            {summary.recentActivity.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No recent activity"
                  description="Audit events will appear here once administrators start using the platform."
                  action={
                    hasPermission(user, "audit.view") ? (
                      <Link href="/administration/audit-logs" className={buttonClassName({ variant: "primary" })}>
                        View audit logs
                      </Link>
                    ) : null
                  }
                />
              </div>
            ) : (
              <div className="space-y-0">
                {summary.recentActivity.map((entry, index) => {
                  const actorName = entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : "System";
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-4 px-6 py-4 ${index === 0 ? "" : "border-t border-sourcehub-border"}`}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sourcehub-primary/10 text-sm font-bold text-sourcehub-primary">
                        {initialsFromName(entry.user?.firstName ?? "S", entry.user?.lastName ?? "H")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sourcehub-text">{formatActionLabel(entry.action)}</p>
                          <Badge tone="outline">{entry.entityType}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {actorName}
                          {entry.entityId ? ` updated ${entry.entityType} ${entry.entityId}` : ` performed this action`}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
