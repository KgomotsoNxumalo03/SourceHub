import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { currentUser } from "@/lib/auth";
import { collectionNames } from "@/lib/collections";
import { firestoreAdmin, prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { canTransitionTaskStatus, refreshProjectSummary } from "@/lib/projects";
import { taskStatuses } from "@/lib/validators";

export async function POST(request: Request) {
  const actor = await currentUser();
  if (!actor)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  if (!actor.permissions.includes("project_tasks.manage"))
    return NextResponse.json({ error: "Permission denied." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    taskId?: string;
    status?: string;
  } | null;
  if (
    !body?.taskId ||
    !body.status ||
    !taskStatuses.includes(body.status as never)
  )
    return NextResponse.json(
      { error: "Invalid task update." },
      { status: 400 },
    );
  const task = await prisma.projectTask.findUnique({
    where: { id: body.taskId },
  });
  if (!task || task.workspaceId !== env.DEFAULT_WORKSPACE_ID)
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  if (!canTransitionTaskStatus(task.status, body.status))
    return NextResponse.json(
      { error: "That task transition is not allowed." },
      { status: 409 },
    );
  await firestoreAdmin.runTransaction(async (transaction) => {
    transaction.update(
      firestoreAdmin.collection(collectionNames.projectTasks).doc(task.id),
      {
        status: body.status,
        progressPercentage:
          body.status === "COMPLETED" ? 100 : (task.progressPercentage ?? 0),
        completedDate:
          body.status === "COMPLETED" ? FieldValue.serverTimestamp() : null,
        updatedBy: actor.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
    transaction.create(
      firestoreAdmin
        .collection(collectionNames.projectTaskStatusHistory)
        .doc(randomUUID()),
      {
        id: randomUUID(),
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        projectId: task.projectId,
        taskId: task.id,
        fromStatus: task.status,
        toStatus: body.status,
        reason: "Kanban board update.",
        changedBy: actor.id,
        changedAt: FieldValue.serverTimestamp(),
      },
    );
    transaction.create(
      firestoreAdmin
        .collection(collectionNames.projectActivities)
        .doc(randomUUID()),
      {
        id: randomUUID(),
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        projectId: task.projectId,
        taskId: task.id,
        type: "TASK_STATUS_CHANGED",
        description: `${task.taskReference} moved to ${body.status}.`,
        actorId: actor.id,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  });
  await refreshProjectSummary(task.projectId, actor.id);
  return NextResponse.json({ ok: true });
}
