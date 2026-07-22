import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  FolderKanban,
  Link2,
  MessageSquare,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  healthLabels,
  projectPriorityLabels,
  projectStatusLabels,
  projectTypeLabels,
  taskStatusLabels,
} from "@/lib/projects";
import { formatDate, formatDateTime } from "@/lib/utils";
import { buttonClassName } from "@/lib/button";
import { AiContextLink } from "@/components/ai-context-link";
import {
  addProjectDependencyAction,
  addProjectMemberAction,
  createProjectCommentAction,
  createProjectMilestoneAction,
  createProjectRiskAction,
  createProjectTaskAction,
  decideProjectTimeAction,
  linkProjectRecordAction,
  logProjectTimeAction,
  submitProjectTimeAction,
  startProjectTimerAction,
  stopProjectTimerAction,
  updateProjectStatusAction,
  updateProjectClientVisibilityAction,
  uploadProjectFileAction,
} from "@/lib/actions/projects";
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
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
  Textarea,
} from "@/components/ui";
import { ProjectBoard } from "@/components/project-board";

function statusTone(
  status: string,
): "success" | "warning" | "danger" | "outline" {
  return ["ACTIVE", "APPROVED", "COMPLETED"].includes(status)
    ? "success"
    : ["AT_RISK", "ON_HOLD", "AWAITING_APPROVAL"].includes(status)
      ? "warning"
      : status === "CANCELLED"
        ? "danger"
        : "outline";
}
function sectionTitle(icon: React.ReactNode, title: string, count?: number) {
  return (
    <CardTitle className="flex items-center gap-2">
      {icon}
      {title}
      {count != null ? <Badge tone="outline">{count}</Badge> : null}
    </CardTitle>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePermission("projects.view");
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.workspaceId !== env.DEFAULT_WORKSPACE_ID) notFound();
  const [
    client,
    site,
    tasks,
    milestones,
    members,
    timeEntries,
    comments,
    risks,
    files,
    dependencies,
    employees,
    tickets,
    assets,
  ] = await Promise.all([
    project.clientId
      ? prisma.client.findUnique({ where: { id: project.clientId } })
      : null,
    project.siteId
      ? prisma.clientSite.findUnique({ where: { id: project.siteId } })
      : null,
    prisma.projectTask.findMany({
      where: { workspaceId: env.DEFAULT_WORKSPACE_ID, projectId: id },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 500,
    }),
    prisma.projectMilestone.findMany({
      where: { workspaceId: env.DEFAULT_WORKSPACE_ID, projectId: id },
      orderBy: { plannedDate: "asc" },
      take: 100,
    }),
    prisma.projectMember.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        projectId: id,
        active: true,
      },
      take: 100,
    }),
    actor.permissions.includes("project_time.view")
      ? prisma.projectTimeEntry.findMany({
          where: { workspaceId: env.DEFAULT_WORKSPACE_ID, projectId: id },
          orderBy: { date: "desc" },
          take: 200,
        })
      : [],
    prisma.projectComment.findMany({
      where: { workspaceId: env.DEFAULT_WORKSPACE_ID, projectId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    actor.permissions.includes("project_risks.manage")
      ? prisma.projectRisk.findMany({
          where: { workspaceId: env.DEFAULT_WORKSPACE_ID, projectId: id },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [],
    actor.permissions.includes("project_files.manage")
      ? prisma.projectFile.findMany({
          where: {
            workspaceId: env.DEFAULT_WORKSPACE_ID,
            projectId: id,
            archivedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [],
    prisma.projectTaskDependency.findMany({
      where: { workspaceId: env.DEFAULT_WORKSPACE_ID, projectId: id },
      take: 300,
    }),
    prisma.employee.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        status: { notIn: ["ARCHIVED", "FORMER_EMPLOYEE"] },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
    }),
    prisma.projectTicketLink.findMany({
      where: { workspaceId: env.DEFAULT_WORKSPACE_ID, projectId: id },
      take: 100,
    }),
    prisma.projectAssetLink.findMany({
      where: { workspaceId: env.DEFAULT_WORKSPACE_ID, projectId: id },
      take: 100,
    }),
  ]);
  const employeeNames = new Map<string, string>(
    employees.map(
      (employee: any) =>
        [
          String(employee.id),
          `${employee.firstName} ${employee.lastName}`,
        ] as const,
    ),
  );
  const actorEmployeeId = employees.find((employee: any) => employee.userId === actor.id || employee.employeeNumber === actor.employeeNumber)?.id ?? actor.id;
  const activeTimer = actor.permissions.includes("project_time.log") ? await prisma.projectTimerLock.findUnique({ where: { id: `${env.DEFAULT_WORKSPACE_ID}:${actorEmployeeId}` } }) : null;
  const totalLogged = timeEntries.reduce(
    (sum: number, entry: any) => sum + Number(entry.durationMinutes || 0),
    0,
  );
  const managerName = employeeNames.get(project.managerId) || "Not assigned";
  const overdueTasks = tasks.filter(
    (task: any) =>
      !["COMPLETED", "CANCELLED"].includes(task.status) &&
      task.dueDate &&
      new Date(task.dueDate).getTime() < Date.now(),
  );
  const nextMilestone = milestones.find(
    (milestone: any) => !["ACHIEVED", "CANCELLED"].includes(milestone.status),
  );
  const taskOptions = tasks.map((task: any) => (
    <option key={task.id} value={task.id}>
      {task.taskReference} · {task.title}
    </option>
  ));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${project.projectReference} · ${project.classification === "CLIENT" ? "Client project" : "Internal project"}`}
        title={project.name}
        description={
          project.description || "No project description has been added."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <AiContextLink module="projects" type="project" id={project.id} enabled={actor.permissions.includes("ai.use") && actor.permissions.includes("ai.projects.use")} />
            <Link
              href="/projects"
              className={buttonClassName({ variant: "ghost" })}
            >
              Back to projects
            </Link>
            {actor.permissions.includes("projects.complete") ? (
              <form action={updateProjectStatusAction}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="status" value="COMPLETED" />
                <input
                  type="hidden"
                  name="completionSummary"
                  value="Completed through project workspace action."
                />
                <Button size="sm" type="submit" variant="secondary">
                  Complete
                </Button>
              </form>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Status
            </p>
            <div className="mt-2">
              <Badge tone={statusTone(project.status)}>
                {projectStatusLabels[project.status]}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Health
            </p>
            <p className="mt-2 font-semibold">
              {healthLabels[project.healthState] || project.healthState}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {project.healthFactors?.join(" · ") || "No active factors"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Progress
            </p>
            <p className="mt-2 text-2xl font-bold">
              {project.progressPercentage ?? 0}%
            </p>
            <div className="mt-2 h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-sourcehub-primary"
                style={{ width: `${project.progressPercentage ?? 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Logged time
            </p>
            <p className="mt-2 text-2xl font-bold">
              {Math.round((totalLogged / 60) * 10) / 10}h
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {project.estimatedHours ?? 0}h estimated
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Next milestone
            </p>
            <p className="mt-2 font-semibold">
              {nextMilestone?.name || "None scheduled"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {nextMilestone?.plannedDate
                ? formatDate(nextMilestone.plannedDate)
                : ""}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <Card>
          <CardHeader>{sectionTitle(<FolderIcon />, "Overview")}</CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-slate-400">Client / site</p>
              <p className="font-semibold">{client?.name || "Internal"}</p>
              <p className="text-slate-500">{site?.name || "No site"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Manager</p>
              <p className="font-semibold">{String(managerName)}</p>
              <p className="text-slate-500">
                {projectTypeLabels[String(project.projectType)] ||
                  String(project.projectType)}
              </p>
              {project.clientId &&
              actor.permissions.includes(
                "client_projects.manage_visibility",
              ) ? (
                <form
                  action={updateProjectClientVisibilityAction}
                  className="mt-3 flex items-center gap-2"
                >
                  <input type="hidden" name="projectId" value={id} />
                  <input
                    type="hidden"
                    name="clientPortalVisible"
                    value={project.clientPortalVisible ? "false" : "true"}
                  />
                  <Button size="sm" type="submit" variant="outline">
                    {project.clientPortalVisible
                      ? "Hide from client"
                      : "Share with client"}
                  </Button>
                </form>
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Planned dates</p>
              <p>
                {formatDate(project.plannedStartDate)} to{" "}
                {formatDate(project.plannedCompletionDate)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">
                Delivery signals
              </p>
              <p>
                {overdueTasks.length} overdue tasks ·{" "}
                {
                  risks.filter((risk: any) =>
                    ["CRITICAL", "HIGH"].includes(risk.severity),
                  ).length
                }{" "}
                high risks · {tickets.length} linked tickets
              </p>
            </div>
          </CardContent>
        </Card>
        {actor.permissions.includes("projects.update") ? (
          <Card>
            <CardHeader>
              {sectionTitle(
                <CheckCircle2 className="h-4 w-4" />,
                "Change status",
              )}
            </CardHeader>
            <CardContent>
              <form action={updateProjectStatusAction} className="space-y-3">
                <input type="hidden" name="projectId" value={id} />
                <Select name="status" defaultValue={project.status}>
                  {Object.entries(projectStatusLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Input
                  name="reason"
                  placeholder="Reason for hold, cancellation, or context"
                />
                <Textarea
                  name="completionSummary"
                  placeholder="Required when completing"
                />
                <Button type="submit">Save status</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
      <section id="tasks" className="space-y-4">
        <Card>
          <CardHeader>
            {sectionTitle(
              <CheckCircle2 className="h-4 w-4" />,
              "Tasks",
              tasks.length,
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {Object.entries(taskStatusLabels).map(([key, label]) => (
                <div key={key} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold">
                    {tasks.filter((task: any) => task.status === key).length}
                  </p>
                </div>
              ))}
            </div>
            {actor.permissions.includes("project_tasks.manage") ? (
              <details className="rounded-xl border border-sourcehub-border p-4">
                <summary className="cursor-pointer font-semibold">
                  Add task
                </summary>
                <form
                  action={createProjectTaskAction}
                  className="mt-4 grid gap-3 md:grid-cols-2"
                >
                  <input type="hidden" name="projectId" value={id} />
                  <Input name="title" placeholder="Task title" required />
                  <Select name="status">
                    <option value="TODO">To do</option>
                    <option value="BACKLOG">Backlog</option>
                    <option value="IN_PROGRESS">In progress</option>
                  </Select>
                  <Select name="priority">
                    <option value="MEDIUM">Medium priority</option>
                    <option value="HIGH">High priority</option>
                    <option value="CRITICAL">Critical priority</option>
                  </Select>
                  <Select name="assigneeId">
                    <option value="">Unassigned</option>
                    {employees.map((employee: any) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName}
                      </option>
                    ))}
                  </Select>
                  <Input name="startDate" type="date" />
                  <Input name="dueDate" type="date" />
                  <Input
                    name="estimatedHours"
                    type="number"
                    placeholder="Estimated hours"
                  />
                  <Input
                    name="labels"
                    placeholder="Labels separated by commas"
                  />
                  <Textarea name="description" placeholder="Task description" />
                  <div>
                    <Button type="submit">Add task</Button>
                  </div>
                </form>
              </details>
            ) : null}
            <ProjectBoard projectId={id} tasks={tasks} />
          </CardContent>
        </Card>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="timeline">
          <CardHeader>
            {sectionTitle(
              <CalendarDays className="h-4 w-4" />,
              "Timeline",
              milestones.length,
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="mb-3 flex justify-between text-xs text-slate-500">
                <span>{formatDate(project.plannedStartDate)}</span>
                <span>Today</span>
                <span>{formatDate(project.plannedCompletionDate)}</span>
              </div>
              <div className="h-3 rounded-full bg-slate-200">
                <div
                  className="h-3 rounded-full bg-sourcehub-primary"
                  style={{ width: `${project.progressPercentage ?? 0}%` }}
                />
              </div>
            </div>
            {tasks.slice(0, 20).map((task: any) => (
              <div
                key={task.id}
                className="grid gap-2 sm:grid-cols-[1fr_auto] rounded-xl border border-sourcehub-border p-3"
              >
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {task.taskReference} · {taskStatusLabels[task.status]}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {task.dueDate ? formatDate(task.dueDate) : "No due date"}
                </p>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              The list remains the accessible timeline alternative for keyboard
              and mobile users.
            </p>
          </CardContent>
        </Card>
        <Card id="milestones">
          <CardHeader>
            {sectionTitle(
              <Flag className="h-4 w-4" />,
              "Milestones",
              milestones.length,
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {milestones.map((milestone: any) => (
              <div
                key={milestone.id}
                className="rounded-xl border border-sourcehub-border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{milestone.name}</p>
                  <Badge
                    tone={
                      milestone.status === "ACHIEVED"
                        ? "success"
                        : milestone.status === "AT_RISK" ||
                            milestone.status === "MISSED"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {milestone.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Planned {formatDate(milestone.plannedDate)} · Owner{" "}
                  {employeeNames.get(String(milestone.ownerId || "")) ||
                    "Unassigned"}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {milestone.description ||
                    milestone.completionCriteria ||
                    "No completion criteria."}
                </p>
              </div>
            ))}
            {actor.permissions.includes("project_tasks.manage") ? (
              <form
                action={createProjectMilestoneAction}
                className="space-y-3 border-t border-sourcehub-border pt-4"
              >
                <input type="hidden" name="projectId" value={id} />
                <Input name="name" placeholder="Milestone name" required />
                <Input name="plannedDate" type="date" required />
                <Select name="ownerId">
                  <option value="">Unassigned owner</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </Select>
                <Textarea
                  name="completionCriteria"
                  placeholder="Completion criteria"
                />
                <Button type="submit" variant="secondary">
                  Add milestone
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="team">
          <CardHeader>
            {sectionTitle(
              <UsersRound className="h-4 w-4" />,
              "Team",
              members.length,
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {members.map((member: any) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-xl border border-sourcehub-border p-3"
              >
                <div>
                  <p className="font-semibold">
                    {employeeNames.get(member.employeeId) || member.employeeId}
                  </p>
                  <p className="text-xs text-slate-500">
                    {member.role} ·{" "}
                    {member.clientVisible ? "Client visible" : "Internal"}
                  </p>
                </div>
                <Badge tone="outline">
                  {
                    tasks.filter(
                      (task: any) => task.assigneeId === member.employeeId,
                    ).length
                  }{" "}
                  tasks
                </Badge>
              </div>
            ))}
            {actor.permissions.includes("project_members.manage") ? (
              <form
                action={addProjectMemberAction}
                className="grid gap-3 border-t border-sourcehub-border pt-4 md:grid-cols-3"
              >
                <input type="hidden" name="projectId" value={id} />
                <Select name="employeeId">
                  <option value="">Select employee</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </Select>
                <Input name="role" placeholder="Project role" />
                <Button type="submit">Add member</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
        <Card id="risks">
          <CardHeader>
            {sectionTitle(
              <ShieldAlert className="h-4 w-4" />,
              "Risks and issues",
              risks.length,
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {risks.map((risk: any) => (
              <div
                key={risk.id}
                className="rounded-xl border border-sourcehub-border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{risk.title}</p>
                  <Badge
                    tone={
                      risk.severity === "CRITICAL"
                        ? "danger"
                        : risk.severity === "HIGH"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {risk.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {risk.type} · {risk.status} ·{" "}
                  {risk.ownerId
                    ? employeeNames.get(risk.ownerId)
                    : "Unassigned"}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {risk.description}
                </p>
              </div>
            ))}
            {actor.permissions.includes("project_risks.manage") ? (
              <details className="border-t border-sourcehub-border pt-4">
                <summary className="cursor-pointer font-semibold">
                  Add risk or issue
                </summary>
                <form
                  action={createProjectRiskAction}
                  className="mt-3 space-y-3"
                >
                  <input type="hidden" name="projectId" value={id} />
                  <Input name="title" placeholder="Title" required />
                  <Select name="type">
                    <option value="RISK">Risk</option>
                    <option value="ISSUE">Issue</option>
                    <option value="DECISION">Decision</option>
                    <option value="DEPENDENCY">Dependency</option>
                    <option value="CHANGE_REQUEST">Change request</option>
                  </Select>
                  <Textarea
                    name="description"
                    placeholder="Description"
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select name="probability">
                      <option value="LOW">Low probability</option>
                      <option value="MEDIUM">Medium probability</option>
                      <option value="HIGH">High probability</option>
                    </Select>
                    <Select name="impact">
                      <option value="LOW">Low impact</option>
                      <option value="MEDIUM">Medium impact</option>
                      <option value="HIGH">High impact</option>
                    </Select>
                  </div>
                  <Select name="ownerId">
                    <option value="">Unassigned owner</option>
                    {employees.map((employee: any) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    name="mitigationPlan"
                    placeholder="Mitigation plan"
                  />
                  <Button type="submit">Add risk</Button>
                </form>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Card id="time">
        <CardHeader>
          {sectionTitle(
            <Clock3 className="h-4 w-4" />,
            "Project time",
            timeEntries.length,
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {actor.permissions.includes("project_time.log") ? (
            <div className="space-y-3"><div className="flex flex-wrap gap-2">{activeTimer?.status === "ACTIVE" ? <form action={stopProjectTimerAction}><Button type="submit" variant="danger">Stop active timer</Button></form> : <form action={startProjectTimerAction}><input type="hidden" name="projectId" value={id} /><Button type="submit" variant="secondary">Start project timer</Button></form>}</div><form
              action={logProjectTimeAction}
              className="grid gap-3 md:grid-cols-4"
            >
              <input type="hidden" name="projectId" value={id} />
              <Select name="taskId">
                <option value="">Project-level time</option>
                {taskOptions}
              </Select>
              <Input name="date" type="date" required />
              <Input
                name="durationMinutes"
                type="number"
                placeholder="Minutes"
                required
              />
              <Input name="workType" placeholder="Work type" />
              <Textarea
                name="description"
                placeholder="What was done"
                required
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="billable" value="true" /> Billable
              </label>
              <Button type="submit">Log time</Button>
            </form></div>
          ) : null}
          {timeEntries.length ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Date</TableHeadCell>
                  <TableHeadCell>Employee</TableHeadCell>
                  <TableHeadCell>Task</TableHeadCell>
                  <TableHeadCell>Duration</TableHeadCell>
                  <TableHeadCell>State</TableHeadCell>
                  <TableHeadCell>Action</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {timeEntries.map((entry: any) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.date)}</TableCell>
                    <TableCell>
                      {employeeNames.get(entry.employeeId) || entry.employeeId}
                    </TableCell>
                    <TableCell>
                      {tasks.find((task: any) => task.id === entry.taskId)
                        ?.title || "Project"}
                    </TableCell>
                    <TableCell>{entry.durationMinutes} min</TableCell>
                    <TableCell>
                      <Badge
                        tone={
                          entry.approvalState === "APPROVED"
                            ? "success"
                            : entry.approvalState === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {entry.approvalState}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {entry.employeeId === actorEmployeeId &&
                      ["DRAFT", "REJECTED"].includes(entry.approvalState) ? (
                        <form action={submitProjectTimeAction}>
                          <input
                            type="hidden"
                            name="entryId"
                            value={entry.id}
                          />
                          <Button size="sm" type="submit" variant="outline">
                            Submit
                          </Button>
                        </form>
                      ) : actor.permissions.includes("project_time.approve") &&
                        entry.approvalState === "SUBMITTED" ? (
                        <form
                          action={decideProjectTimeAction}
                          className="flex gap-1"
                        >
                          <input
                            type="hidden"
                            name="entryId"
                            value={entry.id}
                          />
                          <input
                            type="hidden"
                            name="decision"
                            value="APPROVE"
                          />
                          <Button size="sm" type="submit">
                            Approve
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No time logged"
              description="Project time remains separate from attendance and is only recorded against project work."
            />
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="comments">
          <CardHeader>
            {sectionTitle(
              <MessageSquare className="h-4 w-4" />,
              "Comments",
              comments.length,
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {comments.map((comment: any) => (
              <div
                key={comment.id}
                className="rounded-xl border border-sourcehub-border p-3"
              >
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">
                    {employeeNames.get(comment.authorId) || comment.authorId}
                  </p>
                  <Badge
                    tone={
                      comment.visibility === "CLIENT_VISIBLE"
                        ? "info"
                        : "outline"
                    }
                  >
                    {comment.visibility.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {comment.body}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDateTime(comment.createdAt)}
                </p>
              </div>
            ))}
            {actor.permissions.includes("projects.update") ? (
              <form
                action={createProjectCommentAction}
                className="space-y-3 border-t border-sourcehub-border pt-4"
              >
                <input type="hidden" name="projectId" value={id} />
                <Select name="visibility">
                  <option value="PROJECT_TEAM">Project team</option>
                  <option value="INTERNAL">Internal</option>
                  {project.clientId ? (
                    <option value="CLIENT_VISIBLE">Client visible</option>
                  ) : null}
                </Select>
                <Textarea
                  name="body"
                  placeholder="Write an update or comment"
                  required
                />
                <Button type="submit">Add comment</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
        <Card id="files">
          <CardHeader>
            {sectionTitle(
              <FileText className="h-4 w-4" />,
              "Files",
              files.length,
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Project files are stored privately under the workspace/project
              path and are never public.
            </p>
            {files.map((file: any) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-xl border border-sourcehub-border p-3"
              >
                <div>
                  <p className="font-semibold">{file.originalName}</p>
                  <p className="text-xs text-slate-500">
                    {file.category} · {Math.round(file.fileSize / 1024)} KB ·{" "}
                    {file.clientVisible ? "Client visible" : "Internal"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="outline">Private</Badge>
                  <a
                    href={`/api/projects/files/${file.id}`}
                    className="text-xs font-semibold text-sourcehub-primary"
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
            {actor.permissions.includes("project_files.manage") ? (
              <form
                action={uploadProjectFileAction}
                encType="multipart/form-data"
                className="space-y-3 border-t border-sourcehub-border pt-4"
              >
                <input type="hidden" name="projectId" value={id} />
                <Select name="category">
                  <option value="PROJECT_PLAN">Project plan</option>
                  <option value="SCOPE">Scope document</option>
                  <option value="TECHNICAL">Technical document</option>
                  <option value="DELIVERABLE">Client deliverable</option>
                  <option value="OTHER">Other</option>
                </Select>
                <input
                  name="file"
                  type="file"
                  required
                  className="block w-full rounded-xl border border-sourcehub-border p-2 text-sm"
                />
                <Input name="description" placeholder="File description" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="clientVisible" value="true" />{" "}
                  Client visible
                </label>
                <Button type="submit">Upload private file</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Card id="integrations">
        <CardHeader>
          {sectionTitle(
            <Link2 className="h-4 w-4" />,
            "Linked tickets and assets",
            tickets.length + assets.length,
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            {tickets.map((link: any) => (
              <p key={link.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                Ticket {link.ticketId}
              </p>
            ))}
            {assets.map((link: any) => (
              <p key={link.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                Asset {link.assetId}
              </p>
            ))}
          </div>
          {actor.permissions.includes("projects.update") ? (
            <form
              action={linkProjectRecordAction}
              className="grid gap-3 md:grid-cols-3"
            >
              <input type="hidden" name="projectId" value={id} />
              <Select name="kind">
                <option value="TICKET">Ticket</option>
                <option value="ASSET">Asset</option>
              </Select>
              <Input
                name="recordId"
                placeholder="Existing ticket or asset ID"
                required
              />
              <Button type="submit">Link record</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FolderIcon() {
  return <FolderKanban className="h-4 w-4" />;
}
