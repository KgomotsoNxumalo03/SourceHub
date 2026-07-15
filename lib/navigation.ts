import {
  LayoutDashboard,
  Tickets,
  BriefcaseBusiness,
  Boxes,
  Users,
  BarChart3,
  ShieldAlert,
  Settings2,
} from "lucide-react";

export const navigationItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { label: "Tickets", href: "/tickets", icon: Tickets, comingSoon: true },
  { label: "Clients", href: "#", icon: BriefcaseBusiness, comingSoon: true },
  { label: "Assets", href: "#", icon: Boxes, comingSoon: true },
  { label: "Employees", href: "/administration/users", icon: Users, permission: "users.view" },
  { label: "Reports", href: "#", icon: BarChart3, comingSoon: true },
  { label: "Administration", href: "/administration/users", icon: ShieldAlert, permission: "users.view" },
  { label: "Settings", href: "/settings", icon: Settings2, permission: "settings.view" },
] as const;

export const comingSoonSections = new Set(["Clients", "Assets", "Reports"]);
