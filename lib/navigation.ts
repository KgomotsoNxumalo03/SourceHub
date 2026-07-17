import {
  LayoutDashboard,
  Tickets,
  BriefcaseBusiness,
  Boxes,
  Users,
  BarChart3,
  ShieldAlert,
  Settings2,
  Gauge,
  Workflow,
  Mail,
} from "lucide-react";

export const navigationItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { label: "Tickets", href: "/tickets", icon: Tickets, permission: "tickets.view" },
  { label: "Service Desk", href: "/service-desk", icon: Gauge, permission: "technicians.view" },
  { label: "Clients", href: "/clients", icon: BriefcaseBusiness, permission: "clients.view" },
  { label: "Assets", href: "/assets", icon: Boxes, permission: "assets.view" },
  { label: "Employees", href: "/administration/users", icon: Users, permission: "users.view" },
  { label: "SLA Policies", href: "/administration/sla-policies", icon: Workflow, permission: "slaPolicies.view" },
  { label: "Automations", href: "/administration/automations", icon: Workflow, permission: "automation.view" },
  { label: "Email", href: "/administration/email", icon: Mail, permission: "email.view" },
  { label: "Reports", href: "#", icon: BarChart3, comingSoon: true },
  { label: "Administration", href: "/administration/users", icon: ShieldAlert, permission: "users.view" },
  { label: "Settings", href: "/settings", icon: Settings2, permission: "settings.view" },
] as const;

export const comingSoonSections = new Set(["Reports"]);
