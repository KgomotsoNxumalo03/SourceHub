"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronRight,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
} from "lucide-react";

import { logoutAction } from "@/lib/actions/auth";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/notifications";
import { navigationItems } from "@/lib/navigation";
import { type CurrentUser } from "@/lib/permissions";
import { Avatar, Badge, Button, Card, CardContent, Breadcrumbs, DropdownMenu, Input, buttonClassName } from "@/components/ui";
import { cn, formatDateTime, initialsFromName } from "@/lib/utils";

type ShellNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  readAt: Date | null;
  link: string | null;
  createdAt: Date;
};

export function AppShell({
  user,
  unreadCount,
  notifications,
  children,
}: {
  user: CurrentUser;
  unreadCount: number;
  notifications: ShellNotification[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("sourcehub-sidebar-collapsed");
    if (stored) {
      setCollapsed(stored === "true");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("sourcehub-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  const activeLabel = useMemo(() => {
    const item = navigationItems.find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`));
    return item?.label ?? "Dashboard";
  }, [pathname]);

  const breadcrumbs = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const items = [{ label: "SourceHub", href: "/dashboard" }];

    if (segments.length > 0) {
      let current = "";
      for (const segment of segments) {
        current += `/${segment}`;
        if (segment === "dashboard") {
          items.push({ label: "Dashboard", href: "/dashboard" });
          continue;
        }

        if (segment === "tickets") {
          items.push({ label: "Tickets", href: "/tickets" });
          continue;
        }

        if (segment === "service-desk") {
          items.push({ label: "Service Desk", href: "/service-desk" });
          continue;
        }

        if (segment === "clients") {
          items.push({ label: "Clients", href: "/clients" });
          continue;
        }

        if (segment === "assets") {
          items.push({ label: "Assets", href: "/assets" });
          continue;
        }

        if (segment === "administration") {
          items.push({ label: "Administration", href: "/administration/users" });
          continue;
        }

        if (segment === "users") {
          items.push({ label: "Users", href: "/administration/users" });
          continue;
        }

        if (segment === "roles") {
          items.push({ label: "Roles", href: "/administration/roles" });
          continue;
        }

        if (segment === "audit-logs") {
          items.push({ label: "Audit Logs", href: "/administration/audit-logs" });
          continue;
        }

        if (segment === "settings") {
          items.push({ label: "Settings", href: "/settings" });
          continue;
        }

        if (segment === "asset-types") {
          items.push({ label: "Asset Types", href: "/administration/asset-types" });
          continue;
        }

        if (segment === "sla-policies") {
          items.push({ label: "SLA Policies", href: "/administration/sla-policies" });
          continue;
        }

        if (segment === "automations") {
          items.push({ label: "Automations", href: "/administration/automations" });
          continue;
        }

        if (segment === "email") {
          items.push({ label: "Email", href: "/administration/email" });
          continue;
        }

        if (segment === "profile") {
          items.push({ label: "Profile", href: "/profile" });
          continue;
        }

        if (segment === "notifications") {
          items.push({ label: "Notifications", href: "/notifications" });
          continue;
        }

        if (segment === "new" && current.startsWith("/tickets")) {
          items.push({ label: "New Ticket", href: "/tickets/new" });
          continue;
        }

        if (segment === "new" && current.startsWith("/clients")) {
          items.push({ label: "New Client", href: "/clients/new" });
          continue;
        }

        if (segment === "new" && current.startsWith("/administration/sla-policies")) {
          items.push({ label: "New SLA Policy", href: "/administration/sla-policies/new" });
          continue;
        }

        if (segment.length === 24 || segment.length === 25) {
          continue;
        }
      }
    }

    return items;
  }, [pathname]);

  return (
    <div className="min-h-screen bg-transparent">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden border-r border-white/10 bg-[linear-gradient(180deg,#092058_0%,#11386D_100%)] text-white shadow-2xl transition-all duration-300 lg:flex",
            collapsed ? "w-20" : "w-72",
          )}
        >
          <div className="flex w-full flex-col">
            <div className="flex items-center justify-between gap-3 px-5 py-5">
              <Link href="/dashboard" className="flex items-center gap-3 font-bold">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                  S
                </span>
                {!collapsed ? (
                  <span className="text-xl tracking-tight">SourceHub</span>
                ) : null}
              </Link>
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="rounded-xl p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 pb-5">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                if ("comingSoon" in item && item.comingSoon) {
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/45"
                    >
                      <Icon className="h-5 w-5" />
                      {!collapsed ? (
                        <div className="flex items-center gap-2">
                          <span>{item.label}</span>
                          <Badge tone="outline" className="border-white/15 bg-white/10 text-[10px] uppercase tracking-wide text-white/70">
                            Soon
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition",
                      active ? "bg-white/15 text-white shadow-soft" : "text-white/75 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {!collapsed ? (
                      <span className="flex-1 font-medium">{item.label}</span>
                    ) : null}
                    {!collapsed && active ? <ChevronRight className="h-4 w-4" /> : null}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-white/10 px-5 py-5">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#0BBCEB]" />
                  {!collapsed ? (
                    <div>
                      <p className="text-sm font-semibold">Secure by design</p>
                      <p className="text-xs text-white/70">Role-based access and audit trails.</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className={cn("flex min-h-screen flex-1 flex-col transition-all duration-300", collapsed ? "lg:pl-20" : "lg:pl-72")}>
          <header className="sticky top-0 z-20 border-b border-sourcehub-border bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sourcehub-border bg-white text-sourcehub-text lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="hidden sm:block">
                  <Breadcrumbs items={breadcrumbs} />
                  <div className="mt-1 text-sm text-slate-600">{activeLabel}</div>
                </div>
                <div className="hidden lg:block">
                  <div className="flex items-center gap-3">
                    <div className="relative w-full max-w-md">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input placeholder="Search tickets, users, roles, audit logs..." className="h-10 pl-11" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <DropdownMenu
                  align="right"
                  trigger={
                    <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sourcehub-border bg-white text-sourcehub-text">
                      <Bell className="h-4 w-4" />
                      {unreadCount > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-sourcehub-accent px-1 text-[10px] font-bold text-white">
                          {unreadCount}
                        </span>
                      ) : null}
                    </span>
                  }
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-2 pb-1">
                      <div>
                        <p className="text-sm font-semibold text-sourcehub-text">Notifications</p>
                        <p className="text-xs text-slate-500">{unreadCount} unread</p>
                      </div>
                      <form action={markAllNotificationsReadAction}>
                        <input type="hidden" name="returnTo" value={pathname} />
                        <Button type="submit" size="sm" variant="ghost" className="h-8 px-3 text-xs">
                          Mark all read
                        </Button>
                      </form>
                    </div>
                    <div className="max-h-96 space-y-2 overflow-auto pr-1">
                      {notifications.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-500">No notifications yet.</p>
                      ) : (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={cn(
                              "rounded-2xl border p-3",
                              notification.readAt ? "border-sourcehub-border bg-white" : "border-sourcehub-accent/20 bg-sourcehub-accent/5",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-sourcehub-text">{notification.title}</p>
                                <p className="mt-1 text-xs text-slate-600">{notification.message}</p>
                                <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                                  {formatDateTime(notification.createdAt)}
                                </p>
                              </div>
                              {!notification.readAt ? (
                                <form action={markNotificationReadAction}>
                                  <input type="hidden" name="notificationId" value={notification.id} />
                                  <input type="hidden" name="returnTo" value={pathname} />
                                  <Button type="submit" size="sm" variant="ghost" className="px-2 text-xs">
                                    Read
                                  </Button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <Link href="/notifications" className="block rounded-xl px-2 py-2 text-center text-sm font-medium text-sourcehub-primary hover:bg-sourcehub-muted">
                      View notification center
                    </Link>
                  </div>
                </DropdownMenu>
                <DropdownMenu
                  align="right"
                  trigger={
                    <div className="flex items-center gap-3 rounded-2xl border border-sourcehub-border bg-white px-3 py-2">
                      <Avatar
                        src={user.profileImageUrl}
                        alt={`${user.firstName} ${user.lastName}`}
                        initials={initialsFromName(user.firstName, user.lastName)}
                      />
                      <div className="hidden text-left sm:block">
                        <p className="text-sm font-semibold text-sourcehub-text">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-xs text-slate-500">{user.roles[0]?.name ?? user.email}</p>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-2">
                    <div className="rounded-2xl bg-sourcehub-muted p-3">
                      <p className="text-sm font-semibold text-sourcehub-text">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {user.roles.slice(0, 3).map((role) => (
                          <Badge key={role.id} tone="outline">
                            {role.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Link href="/profile" className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-sourcehub-text hover:bg-sourcehub-muted">
                      Profile
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                    <form action={logoutAction}>
                      <Button type="submit" variant="ghost" className="w-full justify-start px-3 text-sm text-sourcehub-text hover:bg-sourcehub-muted">
                        Sign out
                      </Button>
                    </form>
                  </div>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
              <div className="lg:hidden">
                <Card className="bg-sourcehub-secondary text-white">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-[#0BBCEB]">SourceHub</p>
                      <p className="mt-1 text-lg font-semibold">{activeLabel}</p>
                    </div>
                    <Badge tone="outline" className="border-white/20 bg-white/10 text-white">
                      {user.firstName}
                    </Badge>
                  </CardContent>
                </Card>
              </div>
              <div className="rounded-3xl border border-sourcehub-border bg-sourcehub-surface/90 p-4 shadow-sm sm:p-6">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/55 lg:hidden">
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-[linear-gradient(180deg,#092058_0%,#11386D_100%)] text-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-5">
              <Link href="/dashboard" className="flex items-center gap-3 font-bold">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">S</span>
                SourceHub
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-xl p-2 text-white/70 hover:bg-white/10"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1 px-3">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                if ("comingSoon" in item && item.comingSoon) {
                  return (
                    <div key={item.label} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/45">
                      <Icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
