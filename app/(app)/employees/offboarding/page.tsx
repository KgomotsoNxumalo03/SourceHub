import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { employeeDisplayName } from "@/lib/employees";
import { formatDate } from "@/lib/utils";
import { completeOffboardingTaskAction } from "@/lib/actions/employees";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";

export default async function OffboardingPage() {
  await requirePermission("employees.view");
  const workflows = await prisma.offboardingWorkflow.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: { in: ["ACTIVE", "IN_PROGRESS"] } }, orderBy: { scheduledDate: "asc" }, take: 100 });
  const employees = await prisma.employee.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, id: { in: workflows.map((item: any) => item.employeeId) } }, take: 100 });
  const employeeMap = new Map<string, any>(employees.map((item: any) => [item.id, item] as [string, any]));
  const tasks = workflows.length ? await prisma.offboardingTask.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, workflowId: { in: workflows.map((item: any) => item.id) } }, take: 500 }) : [];
  const taskMap = new Map<string, any[]>(); for (const task of tasks as any[]) taskMap.set(task.workflowId, [...(taskMap.get(task.workflowId) || []), task]);
  return <div className="space-y-6"><PageHeader eyebrow="Employee Management" title="Offboarding" description="Protect access and recover assets before a departure is closed." actions={<Link href="/employees" className="text-sm font-semibold text-sourcehub-primary">Directory</Link>} /><div className="space-y-4">{workflows.length === 0 ? <EmptyState title="No active offboarding" description="Start an offboarding workflow from an employee profile." /> : workflows.map((workflow: any) => { const employee = employeeMap.get(workflow.employeeId); const workflowTasks = taskMap.get(workflow.id) || []; const completed = workflowTasks.filter((task: any) => task.status === "COMPLETED").length; return <Card key={workflow.id}><CardHeader><CardTitle>{employee ? employeeDisplayName(employee) : workflow.employeeId} <span className="ml-2 text-sm font-normal text-slate-500">{completed}/{workflowTasks.length} complete</span></CardTitle><p className="text-sm text-slate-500">Scheduled {formatDate(workflow.scheduledDate)} · {workflow.reason}</p></CardHeader><CardContent className="space-y-2">{workflowTasks.sort((a: any, b: any) => a.order - b.order).map((task: any) => <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sourcehub-border p-3"><div><p className="text-sm font-semibold">{task.order}. {task.title}</p><p className="text-xs text-slate-500">Due {formatDate(task.dueDate)} · {task.status}</p></div>{task.status !== "COMPLETED" && <form action={completeOffboardingTaskAction} className="flex gap-2"><input type="hidden" name="taskId" value={task.id} />{task.title.toLowerCase().includes("recover") ? <input name="overrideReason" placeholder="Override reason if needed" className="w-48 rounded-xl border border-sourcehub-border px-3 py-2 text-xs" /> : null}<button type="submit" className="rounded-xl bg-sourcehub-primary px-3 py-2 text-xs font-semibold text-white">Complete</button></form>}</div>)}</CardContent></Card>; })}</div></div>;
}
