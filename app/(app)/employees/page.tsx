import Link from "next/link";
import { Building2, ClipboardCheck, Plus, ShieldAlert, UserRound, UsersRound } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { employeeStatusLabels, employeeTypeLabels } from "@/lib/employees";
import { formatDate, initialsFromName } from "@/lib/utils";
import { buttonClassName } from "@/lib/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Select, StatCard, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Button } from "@/components/ui";

const tones: Record<string, "success" | "warning" | "danger" | "outline"> = {
  ACTIVE: "success", PREBOARDING: "warning", ON_LEAVE: "warning", NOTICE_PERIOD: "warning", SUSPENDED: "danger", TERMINATED: "danger", FORMER_EMPLOYEE: "outline", ARCHIVED: "outline",
};

export default async function EmployeesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("employees.view");
  const query = await searchParams;
  const search = String(query?.search ?? "").trim();
  const status = String(query?.status ?? "");
  const employmentType = String(query?.employmentType ?? "");
  const cursor = String(query?.cursor ?? "");
  const filters = {
    workspaceId: env.DEFAULT_WORKSPACE_ID,
    ...(status ? { status } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(search ? { OR: [{ firstName: { contains: search, mode: "insensitive" as const } }, { lastName: { contains: search, mode: "insensitive" as const } }, { workEmail: { contains: search, mode: "insensitive" as const } }, { employeeNumber: { contains: search, mode: "insensitive" as const } }, { jobTitle: { contains: search, mode: "insensitive" as const } }] } : {}),
  };
  const [employees, activeCount, onboardingCount, leaveCount, departments] = await Promise.all([
    prisma.employee.findMany({ where: filters, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], ...(cursor ? { cursor: { id: cursor } } : {}), take: 51 }),
    prisma.employee.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: "ACTIVE" } }),
    prisma.employee.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: "PREBOARDING" } }),
    prisma.employee.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: "ON_LEAVE" } }),
    prisma.department.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, active: true }, orderBy: { name: "asc" } }),
  ]);
  const departmentMap = new Map<string, string>(departments.map((department: any) => [department.id, department.name] as [string, string]));
  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (status) qs.set("status", status);
  if (employmentType) qs.set("employmentType", employmentType);

  const hasNext = employees.length > 50;
  const visibleEmployees = employees.slice(0, 50);
  const exportQuery = new URLSearchParams(); if (search) exportQuery.set("search", search); if (status) exportQuery.set("status", status); if (employmentType) exportQuery.set("employmentType", employmentType);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="People operations" title="Employee Management" description="A secure directory for people, employment, access, and operational readiness." actions={actor.permissions.includes("employees.create") ? <Link href="/employees/new" className={buttonClassName({ variant: "primary" })}><Plus className="h-4 w-4" /> Add employee</Link> : null} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active employees" value={activeCount.toLocaleString()} hint="Current workforce" icon={<UserRound className="h-5 w-5" />} />
        <StatCard label="Preboarding" value={onboardingCount.toLocaleString()} hint="Preparing to start" icon={<ClipboardCheck className="h-5 w-5" />} />
        <StatCard label="On leave" value={leaveCount.toLocaleString()} hint="Temporarily away" icon={<UsersRound className="h-5 w-5" />} />
        <StatCard label="Departments" value={departments.length.toLocaleString()} hint="Active structures" icon={<Building2 className="h-5 w-5" />} />
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <Link href="/employees/organisation" className="rounded-2xl border border-sourcehub-border bg-white p-4 transition hover:-translate-y-0.5 hover:border-sourcehub-primary"><Building2 className="h-5 w-5 text-sourcehub-primary" /><p className="mt-3 font-semibold">Organisation</p><p className="mt-1 text-sm text-slate-500">Departments, teams, and reporting lines.</p></Link>
        <Link href="/employees/onboarding" className="rounded-2xl border border-sourcehub-border bg-white p-4 transition hover:-translate-y-0.5 hover:border-sourcehub-primary"><ClipboardCheck className="h-5 w-5 text-sourcehub-primary" /><p className="mt-3 font-semibold">Onboarding</p><p className="mt-1 text-sm text-slate-500">Track new starter readiness.</p></Link>
        <Link href="/employees/offboarding" className="rounded-2xl border border-sourcehub-border bg-white p-4 transition hover:-translate-y-0.5 hover:border-sourcehub-primary"><ShieldAlert className="h-5 w-5 text-sourcehub-primary" /><p className="mt-3 font-semibold">Offboarding</p><p className="mt-1 text-sm text-slate-500">Recover access, assets, and endpoints.</p></Link>
        <Link href="/administration/users" className="rounded-2xl border border-sourcehub-border bg-white p-4 transition hover:-translate-y-0.5 hover:border-sourcehub-primary"><UsersRound className="h-5 w-5 text-sourcehub-primary" /><p className="mt-3 font-semibold">User accounts</p><p className="mt-1 text-sm text-slate-500">Manage SourceHub roles separately.</p></Link>
      </div>
      <Card>
        <CardHeader><CardTitle>Directory</CardTitle></CardHeader>
        <CardContent>
          <form method="get" className="mb-5 grid gap-3 md:grid-cols-[1.5fr_0.8fr_0.8fr_auto]">
            <Input name="search" defaultValue={search} placeholder="Name, employee number, email, or title" />
            <Select name="status" defaultValue={status}><option value="">All statuses</option>{Object.entries(employeeStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
            <Select name="employmentType" defaultValue={employmentType}><option value="">All employment types</option>{Object.entries(employeeTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
            <div className="flex gap-2"><Button type="submit" variant="secondary">Filter</Button><a href={`/api/employees/export?${exportQuery}`} className={buttonClassName({ variant: "ghost" })}>CSV</a></div>
          </form>
          {employees.length === 0 ? <EmptyState title="No employees found" description="Try another search or create the first employee record." action={actor.permissions.includes("employees.create") ? <Link href="/employees/new" className={buttonClassName({ variant: "primary" })}>Add employee</Link> : null} /> : (
            <Table><TableHead><TableRow><TableHeadCell>Employee</TableHeadCell><TableHeadCell>Role</TableHeadCell><TableHeadCell>Department</TableHeadCell><TableHeadCell>Type</TableHeadCell><TableHeadCell>Status</TableHeadCell><TableHeadCell>Start date</TableHeadCell><TableHeadCell /></TableRow></TableHead><TableBody>
              {visibleEmployees.map((employee: any) => <TableRow key={employee.id}><TableCell><Link href={`/employees/${employee.id}`} className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-sourcehub-primary text-sm font-bold text-white">{initialsFromName(employee.firstName, employee.lastName)}</span><span><strong className="block text-sourcehub-text">{employee.preferredName || employee.firstName} {employee.lastName}</strong><span className="text-xs text-slate-500">{employee.employeeNumber} · {employee.workEmail}</span></span></Link></TableCell><TableCell>{employee.jobTitle || "Unassigned"}</TableCell><TableCell>{departmentMap.get(employee.departmentId) || "Unassigned"}</TableCell><TableCell>{employeeTypeLabels[employee.employmentType as keyof typeof employeeTypeLabels] || employee.employmentType}</TableCell><TableCell><Badge tone={tones[employee.status] || "outline"}>{employeeStatusLabels[employee.status as keyof typeof employeeStatusLabels] || employee.status}</Badge></TableCell><TableCell>{formatDate(employee.startDate)}</TableCell><TableCell><Link href={`/employees/${employee.id}`} className="text-sm font-semibold text-sourcehub-primary">View</Link></TableCell></TableRow>)}
            </TableBody></Table>
          )}
          {hasNext ? <div className="mt-4 flex items-center justify-between"><p className="text-xs text-slate-500">Showing 50 employees per page using a Firestore cursor.</p><a href={`/employees?${new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), ...(employmentType ? { employmentType } : {}), cursor: visibleEmployees[visibleEmployees.length - 1]?.id || "" })}`} className={buttonClassName({ variant: "ghost" })}>Next page</a></div> : null}
        </CardContent>
      </Card>
      {qs.toString() ? <p className="text-xs text-slate-500">Filters active: {qs.toString().replaceAll("&", " · ").replaceAll("=", ": ")}</p> : null}
    </div>
  );
}
