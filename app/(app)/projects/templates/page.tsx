import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { projectPriorityLabels, projectTypeLabels } from "@/lib/projects";
import {
  createProjectFromTemplateAction,
  createProjectTemplateAction,
} from "@/lib/actions/projects";
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

export default async function ProjectTemplatesPage() {
  const actor = await requirePermission("projects.view");
  const [templates, clients] = await Promise.all([
    prisma.projectTemplate.findMany({
      where: { workspaceId: env.DEFAULT_WORKSPACE_ID, active: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    prisma.client.findMany({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        status: { notIn: ["ARCHIVED"] },
      },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Project templates"
        description="Create repeatable delivery plans without linking live projects to mutable template tasks."
        actions={
          <Link
            href="/projects"
            className="text-sm font-semibold text-sourcehub-primary"
          >
            Back to projects
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        {actor.permissions.includes("project_templates.manage") ? (
          <Card>
            <CardHeader>
              <CardTitle>New template</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createProjectTemplateAction} className="space-y-3">
                <Input name="name" placeholder="Template name" required />
                <Select name="projectType">
                  {Object.entries(projectTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Select name="defaultPriority">
                  {Object.entries(projectPriorityLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
                <Input name="phases" placeholder="Phases separated by commas" />
                <Textarea
                  name="description"
                  placeholder="Template description"
                />
                <Textarea
                  name="tasks"
                  placeholder="One default task per line"
                />
                <Button type="submit">Create template</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
        <div className="space-y-4">
          {templates.map((template: any) => (
            <Card key={template.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {template.name}
                  <span className="text-xs font-normal text-slate-500">
                    v{template.version}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-600">
                  {template.description || "No description"}
                </p>
                <p className="text-xs text-slate-500">
                  {projectTypeLabels[template.projectType] ||
                    template.projectType}{" "}
                  · Default priority {template.defaultPriority}
                </p>
                {actor.permissions.includes("projects.create") ? (
                  <form
                    action={createProjectFromTemplateAction}
                    className="grid gap-3 md:grid-cols-3"
                  >
                    <input
                      type="hidden"
                      name="templateId"
                      value={template.id}
                    />
                    <Input name="name" placeholder="Project name" required />
                    <Input name="plannedStartDate" type="date" required />
                    <Select name="clientId">
                      <option value="">Internal project</option>
                      {clients.map((client: any) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      name="siteId"
                      placeholder="Client site ID (optional)"
                    />
                    <Button type="submit">Create from template</Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {templates.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-slate-500">
                No active templates configured.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
