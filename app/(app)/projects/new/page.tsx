import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { projectPriorityLabels, projectTypeLabels } from "@/lib/projects";
import { createProjectAction } from "@/lib/actions/projects";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

function Field({
  label,
  name,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm font-medium">
      {label}
      <Input name={name} type={type} required={required} />
    </label>
  );
}

export default async function NewProjectPage() {
  await requirePermission("projects.create");
  const [clients, employees] = await Promise.all([
    prisma.client.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        status: { notIn: ["ARCHIVED"] },
      },
      orderBy: { name: "asc" },
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
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Create project"
        description="Create a scoped project record. Additional work items can be added from the project workspace."
        actions={
          <Link
            href="/projects"
            className="text-sm font-semibold text-sourcehub-primary"
          >
            Back to projects
          </Link>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createProjectAction} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Project name" name="name" required />
              <label className="space-y-1 text-sm font-medium">
                Classification
                <Select name="classification">
                  <option value="INTERNAL">Internal project</option>
                  <option value="CLIENT">Client project</option>
                </Select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                Project type
                <Select name="projectType">
                  {Object.entries(projectTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                Priority
                <Select name="priority">
                  {Object.entries(projectPriorityLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                Client
                <Select name="clientId">
                  <option value="">Internal / no client</option>
                  {clients.map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              </label>
              <Field label="Client site ID (optional)" name="siteId" />
            </div>
            <Textarea
              name="description"
              placeholder="Scope, intended outcome, and delivery context"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Project manager
                <Select name="managerId">
                  <option value="">Not assigned</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                Project owner
                <Select name="ownerId">
                  <option value="">Not assigned</option>
                  {employees.map((employee: any) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </Select>
              </label>
              <Field
                label="Planned start"
                name="plannedStartDate"
                type="date"
                required
              />
              <Field
                label="Planned completion"
                name="plannedCompletionDate"
                type="date"
                required
              />
              <Field
                label="Estimated hours"
                name="estimatedHours"
                type="number"
                required
              />
              <label className="space-y-1 text-sm font-medium">
                Billing method
                <Input
                  name="billingMethod"
                  placeholder="Fixed fee, time and materials, or internal"
                />
              </label>
              <Field
                label="Purchase order reference"
                name="purchaseOrderReference"
              />
              <Field label="Contract reference" name="contractReference" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="billable" value="true" /> Billable
              project
            </label>
            <div className="flex gap-3">
              <Button type="submit">Create project</Button>
              <Link
                href="/projects"
                className="inline-flex h-10 items-center rounded-xl border border-sourcehub-border px-4 text-sm font-medium"
              >
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
