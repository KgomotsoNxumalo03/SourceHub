import Link from "next/link";
import { FolderKanban, Plus, Search, ShieldAlert, Timer } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  projectPriorityLabels,
  projectStatusLabels,
  projectTypeLabels,
} from "@/lib/projects";
import { buttonClassName } from "@/lib/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from "@/components/ui";

function tone(value: string): "success" | "warning" | "danger" | "outline" {
  return value === "ACTIVE" || value === "APPROVED" || value === "COMPLETED"
    ? "success"
    : value === "AT_RISK" ||
        value === "AWAITING_APPROVAL" ||
        value === "ON_HOLD"
      ? "warning"
      : value === "CANCELLED"
        ? "danger"
        : "outline";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("projects.view");
  const query = await searchParams;
  const search = String(query?.search ?? "")
    .trim()
    .toLowerCase();
  const status = String(query?.status ?? "");
  const priority = String(query?.priority ?? "");
  const projectType = String(query?.projectType ?? "");
  const cursor = String(query?.cursor ?? "");
  const where: any = {
    workspaceId: env.DEFAULT_WORKSPACE_ID,
    archivedAt: null,
  };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (projectType) where.projectType = projectType;
  if (search) where.searchTokens = { arrayContains: search };
  const projects: any[] = await prisma.project.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 25,
    ...(cursor ? { cursor: { id: cursor } } : {}),
  });
  const clientIds = Array.from(
    new Set(projects.map((project) => project.clientId).filter(Boolean)),
  ) as string[];
  const clients: any[] = clientIds.length
    ? await prisma.client.findMany({
        where: { workspaceId: env.DEFAULT_WORKSPACE_ID, id: { in: clientIds } },
      })
    : [];
  const clientNames = new Map<string, string>(
    clients.map((client) => [client.id, String(client.name)]),
  );
  const [activeCount, riskCount, approvalCount, overdueTaskCount] =
    await Promise.all([
      prisma.project.count({
        where: {
          workspaceId: env.DEFAULT_WORKSPACE_ID,
          status: "ACTIVE",
          archivedAt: null,
        },
      }),
      prisma.project.count({
        where: {
          workspaceId: env.DEFAULT_WORKSPACE_ID,
          healthState: { in: ["AT_RISK", "CRITICAL"] },
          archivedAt: null,
        },
      }),
      prisma.project.count({
        where: {
          workspaceId: env.DEFAULT_WORKSPACE_ID,
          status: "AWAITING_APPROVAL",
          archivedAt: null,
        },
      }),
      prisma.projectTask.count({
        where: {
          workspaceId: env.DEFAULT_WORKSPACE_ID,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          dueDate: { lt: new Date() },
        },
      }),
    ]);
  const nextCursor =
    projects.length === 25 ? projects[projects.length - 1]?.id : "";
  const queryString = new URLSearchParams();
  if (search) queryString.set("search", search);
  if (status) queryString.set("status", status);
  if (priority) queryString.set("priority", priority);
  if (projectType) queryString.set("projectType", projectType);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Delivery operations"
        title="Projects"
        description="Plan, execute, and report on internal and client delivery work."
        actions={
          <div className="flex gap-2">
            {actor.permissions.includes("project_reports.export") ? (
              <a
                href="/api/projects/export"
                className={buttonClassName({ variant: "outline" })}
              >
                Export CSV
              </a>
            ) : null}
            {actor.permissions.includes("projects.create") ? (
              <Link href="/projects/new" className={buttonClassName({})}>
                <Plus className="h-4 w-4" /> New project
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active projects"
          value={String(activeCount)}
          hint="Currently delivering"
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <StatCard
          label="At risk"
          value={String(riskCount)}
          hint="Needs intervention"
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <StatCard
          label="Awaiting approval"
          value={String(approvalCount)}
          hint="Governance queue"
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <StatCard
          label="Overdue tasks"
          value={String(overdueTaskCount)}
          hint="Across the workspace"
          icon={<Timer className="h-5 w-5" />}
        />
      </div>
      <Card>
        <CardHeader>
          <form
            className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]"
            method="get"
          >
            <label className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                name="search"
                defaultValue={search}
                placeholder="Search project reference or name"
                className="pl-9"
              />
            </label>
            <Select name="status" defaultValue={status}>
              <option value="">All statuses</option>
              {Object.entries(projectStatusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <Select name="priority" defaultValue={priority}>
              <option value="">All priorities</option>
              {Object.entries(projectPriorityLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <Select name="projectType" defaultValue={projectType}>
              <option value="">All types</option>
              {Object.entries(projectTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <button
              className={buttonClassName({ variant: "outline" })}
              type="submit"
            >
              Filter
            </button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {projects.length ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Project</TableHeadCell>
                  <TableHeadCell>Client</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Priority</TableHeadCell>
                  <TableHeadCell>Progress</TableHeadCell>
                  <TableHeadCell>Health</TableHeadCell>
                  <TableHeadCell>Due</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-semibold text-sourcehub-primary hover:underline"
                      >
                        {String(project.projectReference)}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {String(project.name)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {projectTypeLabels[String(project.projectType)] ||
                          String(project.projectType)}
                      </p>
                    </TableCell>
                    <TableCell>
                      {project.clientId ? (
                        clientNames.get(String(project.clientId)) || "Client"
                      ) : (
                        <span className="text-slate-500">Internal</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={tone(String(project.status))}>
                        {projectStatusLabels[String(project.status)] ||
                          String(project.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {projectPriorityLabels[String(project.priority)] ||
                        String(project.priority)}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-28">
                        <div className="mb-1 flex justify-between text-xs">
                          <span>
                            {String(project.progressPercentage ?? 0)}%
                          </span>
                          <span className="text-slate-400">
                            {String(project.estimatedHours ?? 0)}h est.
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-sourcehub-primary"
                            style={{
                              width: `${Math.min(100, Number(project.progressPercentage ?? 0))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={
                          project.healthState === "HEALTHY" ||
                          project.healthState === "COMPLETED"
                            ? "success"
                            : project.healthState === "CRITICAL"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {String(project.healthState || "UNKNOWN").replaceAll(
                          "_",
                          " ",
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {project.plannedCompletionDate
                        ? new Date(
                            project.plannedCompletionDate,
                          ).toLocaleDateString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-8">
              <EmptyState
                title="No projects match these filters"
                description="Create a project or adjust the search filters to see delivery work."
              />
            </div>
          )}
        </CardContent>
      </Card>
      {nextCursor ? (
        <div className="flex justify-end">
          <Link
            href={`/projects?${queryString.toString()}&cursor=${nextCursor}`}
            className="text-sm font-semibold text-sourcehub-primary"
          >
            Next page
          </Link>
        </div>
      ) : null}
    </div>
  );
}
