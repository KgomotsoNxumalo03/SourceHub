import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

function csv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET() {
  const actor = await currentUser();
  if (!actor)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!actor.permissions.includes("project_reports.export"))
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  const projects = await prisma.project.findMany({
    where: { workspaceId: env.DEFAULT_WORKSPACE_ID, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });
  const rows = [
    "Project reference,Name,Status,Priority,Health,Progress,Estimated hours,Billable,Client,Planned start,Planned completion",
    ...projects.map((project: any) =>
      [
        project.projectReference,
        project.name,
        project.status,
        project.priority,
        project.healthState,
        project.progressPercentage,
        project.estimatedHours,
        project.billable,
        project.clientId,
        project.plannedStartDate,
        project.plannedCompletionDate,
      ]
        .map(csv)
        .join(","),
    ),
  ];
  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=sourcehub-projects.csv",
      "Cache-Control": "no-store",
    },
  });
}
