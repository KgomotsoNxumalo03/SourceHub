"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";

import { currentUser } from "@/lib/auth";
import { collectionNames } from "@/lib/collections";
import { firestoreAdmin, prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import {
  savePrivateBinaryToStorage,
  buildWorkspaceStoragePath,
  sanitizeFilename,
  validateUpload,
} from "@/lib/storage";
import {
  canTransitionProjectStatus,
  canTransitionTaskStatus,
  dateOrNull,
  dependencyWouldCycle,
  labelsFromText,
  projectSearchTokens,
  refreshProjectSummary,
  riskSeverity,
} from "@/lib/projects";
import {
  projectCommentSchema,
  projectDependencySchema,
  projectFormSchema,
  projectMilestoneSchema,
  projectRiskSchema,
  projectStatusSchema,
  projectTaskSchema,
  projectTaskStatusSchema,
  projectTimeDecisionSchema,
  projectTimeEntrySchema,
} from "@/lib/validators";
import { employeeForAttendance } from "@/lib/attendance";

const workspaceId = env.DEFAULT_WORKSPACE_ID;

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}
function checked(formData: FormData, name: string) {
  return formData.get(name) === "true" || formData.get(name) === "on";
}
function ipAddress() {
  return (
    headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers().get("x-real-ip") ??
    null
  );
}

async function actorFor(permission: string) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes(permission)) redirect("/access-denied");
  return actor;
}

async function projectFor(id: string, permission = "projects.view") {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.workspaceId !== workspaceId)
    fail("/projects", "Project not found.");
  const actor = await actorFor(permission);
  return { actor, project };
}

async function validateClientAndSite(clientId: string, siteId: string) {
  if (!clientId) return { client: null, site: null };
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.workspaceId !== workspaceId)
    fail("/projects/new", "Selected client is not available.");
  const site = siteId
    ? await prisma.clientSite.findUnique({ where: { id: siteId } })
    : null;
  if (
    siteId &&
    (!site || site.workspaceId !== workspaceId || site.clientId !== client.id)
  )
    fail(
      "/projects/new",
      "Selected site does not belong to the selected client.",
    );
  return { client, site };
}

async function employeeReference(id: string) {
  if (!id) return null;
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee || employee.workspaceId !== workspaceId)
    fail("/projects", "Selected employee is not available.");
  return employee;
}

function projectPath(id: string) {
  return `/projects/${id}`;
}

export async function createProjectAction(formData: FormData) {
  const actor = await actorFor("projects.create");
  const parsed = projectFormSchema.safeParse({
    name: value(formData, "name"),
    description: value(formData, "description"),
    projectType: value(formData, "projectType"),
    priority: value(formData, "priority"),
    clientId: value(formData, "clientId"),
    siteId: value(formData, "siteId"),
    classification: value(formData, "classification") || "INTERNAL",
    managerId: value(formData, "managerId"),
    ownerId: value(formData, "ownerId"),
    plannedStartDate: value(formData, "plannedStartDate"),
    plannedCompletionDate: value(formData, "plannedCompletionDate"),
    estimatedHours: value(formData, "estimatedHours") || 0,
    billable: checked(formData, "billable"),
    billingMethod: value(formData, "billingMethod"),
    purchaseOrderReference: value(formData, "purchaseOrderReference"),
    contractReference: value(formData, "contractReference"),
    healthState: "HEALTHY",
  });
  if (!parsed.success)
    fail(
      "/projects/new",
      parsed.error.issues[0]?.message ?? "Please review the project form.",
    );
  const data = parsed.data;
  if (data.classification === "CLIENT" && !data.clientId)
    fail("/projects/new", "Client projects require a client.");
  const { client, site } = await validateClientAndSite(
    data.clientId || "",
    data.siteId || "",
  );
  await employeeReference(data.managerId || "");
  await employeeReference(data.ownerId || "");
  const projectId = randomUUID();
  const projectReference = `PRJ-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const uniquenessId = `${workspaceId}:${projectReference}`;
  const now = new Date();
  await firestoreAdmin
    .runTransaction(async (transaction) => {
      const uniqueness = firestoreAdmin
        .collection(collectionNames.projectUniqueness)
        .doc(uniquenessId);
      if ((await transaction.get(uniqueness)).exists)
        throw new Error("PROJECT_REFERENCE_COLLISION");
      transaction.create(uniqueness, {
        workspaceId,
        projectId,
        projectReference,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(
        firestoreAdmin.collection(collectionNames.projects).doc(projectId),
        {
          id: projectId,
          workspaceId,
          projectReference,
          name: data.name,
          description: data.description || null,
          projectType: data.projectType,
          status: "DRAFT",
          priority: data.priority,
          classification: data.classification,
          clientPortalVisible: false,
          clientId: client?.id ?? null,
          siteId: site?.id ?? null,
          managerId: data.managerId || null,
          ownerId: data.ownerId || null,
          plannedStartDate: dateOrNull(data.plannedStartDate),
          plannedCompletionDate: dateOrNull(data.plannedCompletionDate),
          actualStartDate: null,
          actualCompletionDate: null,
          estimatedDurationDays: Math.max(
            0,
            Math.ceil(
              (new Date(data.plannedCompletionDate).getTime() -
                new Date(data.plannedStartDate).getTime()) /
                86400000,
            ),
          ),
          progressPercentage: 0,
          currentPhase: "Planning",
          healthState: "HEALTHY",
          healthFactors: [],
          healthCalculationVersion: 1,
          healthCalculatedAt: now,
          estimatedHours: data.estimatedHours,
          approvedBudget: null,
          internalCostEstimate: null,
          billable: data.billable,
          billingMethod: data.billingMethod || null,
          purchaseOrderReference: data.purchaseOrderReference || null,
          contractReference: data.contractReference || null,
          archivedAt: null,
          completedAt: null,
          completionSummary: null,
          createdBy: actor.id,
          updatedBy: actor.id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          searchTokens: projectSearchTokens([
            data.name,
            data.projectType,
            client?.name,
            site?.name,
            projectReference,
          ]),
        },
      );
      transaction.create(
        firestoreAdmin
          .collection(collectionNames.projectStatusHistory)
          .doc(randomUUID()),
        {
          id: randomUUID(),
          workspaceId,
          projectId,
          fromStatus: null,
          toStatus: "DRAFT",
          reason: "Project created.",
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
          workspaceId,
          projectId,
          type: "PROJECT_CREATED",
          description: `Created ${projectReference}.`,
          actorId: actor.id,
          createdAt: FieldValue.serverTimestamp(),
        },
      );
    })
    .catch((error: any) => {
      if (error?.message === "PROJECT_REFERENCE_COLLISION")
        return createProjectAction(formData);
      throw error;
    });
  await logAudit({
    userId: actor.id,
    action: "projects.create",
    entityType: "Project",
    entityId: projectId,
    newValues: {
      projectReference,
      name: data.name,
      clientId: client?.id ?? null,
    },
    ipAddress: ipAddress(),
  });
  revalidatePath("/projects");
  redirect(`${projectPath(projectId)}?created=1`);
}

export async function updateProjectStatusAction(formData: FormData) {
  const projectId = value(formData, "projectId");
  const { actor, project } = await projectFor(projectId, "projects.view");
  const parsed = projectStatusSchema.safeParse({
    projectId,
    status: value(formData, "status"),
    reason: value(formData, "reason"),
    completionSummary: value(formData, "completionSummary"),
  });
  if (!parsed.success)
    fail(
      projectPath(projectId),
      parsed.error.issues[0]?.message ?? "Please review the status change.",
    );
  const data = parsed.data;
  const restrictedPermission = data.status === "APPROVED" ? "projects.approve" : data.status === "COMPLETED" ? "projects.complete" : data.status === "ARCHIVED" ? "projects.archive" : "projects.update";
  if (!actor.permissions.includes(restrictedPermission)) fail(projectPath(projectId), "You do not have permission to apply that project transition.");
  if (!canTransitionProjectStatus(project.status, data.status))
    fail(
      projectPath(projectId),
      `Cannot move a ${project.status.toLowerCase()} project to ${data.status.toLowerCase()}.`,
    );
  if (["CANCELLED", "ON_HOLD"].includes(data.status) && !data.reason)
    fail(projectPath(projectId), "A reason is required for this status.");
  if (data.status === "COMPLETED" && !data.completionSummary)
    fail(projectPath(projectId), "A completion summary is required.");
  const updates: any = {
    status: data.status,
    updatedBy: actor.id,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (data.status === "ACTIVE" && !project.actualStartDate)
    updates.actualStartDate = FieldValue.serverTimestamp();
  if (data.status === "COMPLETED") {
    updates.actualCompletionDate = FieldValue.serverTimestamp();
    updates.completedAt = FieldValue.serverTimestamp();
    updates.completionSummary = data.completionSummary;
    updates.progressPercentage = 100;
  }
  if (data.status === "ARCHIVED")
    updates.archivedAt = FieldValue.serverTimestamp();
  if (data.status !== "ARCHIVED") updates.archivedAt = null;
  await firestoreAdmin.runTransaction(async (transaction) => {
    transaction.update(
      firestoreAdmin.collection(collectionNames.projects).doc(projectId),
      updates,
    );
    transaction.create(
      firestoreAdmin
        .collection(collectionNames.projectStatusHistory)
        .doc(randomUUID()),
      {
        id: randomUUID(),
        workspaceId,
        projectId,
        fromStatus: project.status,
        toStatus: data.status,
        reason: data.reason || null,
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
        workspaceId,
        projectId,
        type: "PROJECT_STATUS_CHANGED",
        description: `${project.status} to ${data.status}.`,
        actorId: actor.id,
        metadata: { reason: data.reason || null },
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  });
  await logAudit({
    userId: actor.id,
    action: "projects.status_change",
    entityType: "Project",
    entityId: projectId,
    previousValues: { status: project.status },
    newValues: { status: data.status, reason: data.reason || null },
    ipAddress: ipAddress(),
  });
  revalidatePath("/projects");
  revalidatePath(projectPath(projectId));
  redirect(`${projectPath(projectId)}?statusChanged=1`);
}

export async function createProjectTaskAction(formData: FormData) {
  const actor = await actorFor("project_tasks.manage");
  const parsed = projectTaskSchema.safeParse({
    projectId: value(formData, "projectId"),
    title: value(formData, "title"),
    description: value(formData, "description"),
    parentTaskId: value(formData, "parentTaskId"),
    status: value(formData, "status") || "TODO",
    priority: value(formData, "priority") || "MEDIUM",
    assigneeId: value(formData, "assigneeId"),
    teamId: value(formData, "teamId"),
    startDate: value(formData, "startDate"),
    dueDate: value(formData, "dueDate"),
    estimatedHours: value(formData, "estimatedHours") || 0,
    billable: checked(formData, "billable"),
    labels: value(formData, "labels"),
  });
  if (!parsed.success)
    fail(
      "/projects",
      parsed.error.issues[0]?.message ?? "Please review the task.",
    );
  const data = parsed.data;
  const { project } = await projectFor(data.projectId, "project_tasks.manage");
  if (data.parentTaskId) {
    const parent = await prisma.projectTask.findUnique({
      where: { id: data.parentTaskId },
    });
    if (!parent || parent.projectId !== project.id)
      fail(
        projectPath(project.id),
        "The parent task must belong to this project.",
      );
  }
  await employeeReference(data.assigneeId || "");
  const taskId = randomUUID();
  const taskReference = `${project.projectReference}-T${randomUUID().slice(0, 5).toUpperCase()}`;
  await firestoreAdmin.runTransaction(async (transaction) => {
    transaction.create(
      firestoreAdmin
        .collection(collectionNames.projectTaskUniqueness)
        .doc(`${workspaceId}:${taskReference}`),
      {
        workspaceId,
        projectId: project.id,
        taskId,
        taskReference,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
    transaction.create(
      firestoreAdmin.collection(collectionNames.projectTasks).doc(taskId),
      {
        id: taskId,
        workspaceId,
        projectId: project.id,
        taskReference,
        title: data.title,
        description: data.description || null,
        parentTaskId: data.parentTaskId || null,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId || null,
        teamId: data.teamId || null,
        reporterId: actor.id,
        startDate: dateOrNull(data.startDate),
        dueDate: dateOrNull(data.dueDate),
        completedDate:
          data.status === "COMPLETED" ? FieldValue.serverTimestamp() : null,
        estimatedHours: data.estimatedHours,
        loggedHours: 0,
        billable: data.billable,
        labels: labelsFromText(data.labels),
        checklist: [],
        progressPercentage: data.status === "COMPLETED" ? 100 : 0,
        createdBy: actor.id,
        updatedBy: actor.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
    transaction.create(
      firestoreAdmin
        .collection(collectionNames.projectTaskStatusHistory)
        .doc(randomUUID()),
      {
        id: randomUUID(),
        workspaceId,
        projectId: project.id,
        taskId,
        fromStatus: null,
        toStatus: data.status,
        reason: "Task created.",
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
        workspaceId,
        projectId: project.id,
        taskId,
        type: "TASK_CREATED",
        description: `Created ${taskReference}.`,
        actorId: actor.id,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  });
  await refreshProjectSummary(project.id, actor.id);
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?taskCreated=1`);
}

export async function updateProjectTaskStatusAction(formData: FormData) {
  const actor = await actorFor("project_tasks.manage");
  const parsed = projectTaskStatusSchema.safeParse({
    taskId: value(formData, "taskId"),
    status: value(formData, "status"),
    reason: value(formData, "reason"),
  });
  if (!parsed.success)
    fail(
      "/projects",
      parsed.error.issues[0]?.message ?? "Please review the task status.",
    );
  const task = await prisma.projectTask.findUnique({
    where: { id: parsed.data.taskId },
  });
  if (!task || task.workspaceId !== workspaceId)
    fail("/projects", "Task not found.");
  if (!canTransitionTaskStatus(task.status, parsed.data.status))
    fail(
      projectPath(task.projectId),
      `Cannot move a ${task.status.toLowerCase()} task to ${parsed.data.status.toLowerCase()}.`,
    );
  if (parsed.data.status === "CANCELLED" && !parsed.data.reason)
    fail(projectPath(task.projectId), "A cancellation reason is required.");
  await firestoreAdmin.runTransaction(async (transaction) => {
    transaction.update(
      firestoreAdmin.collection(collectionNames.projectTasks).doc(task.id),
      {
        status: parsed.data.status,
        progressPercentage:
          parsed.data.status === "COMPLETED"
            ? 100
            : (task.progressPercentage ?? 0),
        completedDate:
          parsed.data.status === "COMPLETED"
            ? FieldValue.serverTimestamp()
            : null,
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
        workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        fromStatus: task.status,
        toStatus: parsed.data.status,
        reason: parsed.data.reason || null,
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
        workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        type: "TASK_STATUS_CHANGED",
        description: `${task.taskReference} moved to ${parsed.data.status}.`,
        actorId: actor.id,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  });
  await refreshProjectSummary(task.projectId, actor.id);
  revalidatePath(projectPath(task.projectId));
  redirect(`${projectPath(task.projectId)}?taskUpdated=1`);
}

export async function addProjectDependencyAction(formData: FormData) {
  const actor = await actorFor("project_tasks.manage");
  const parsed = projectDependencySchema.safeParse({
    projectId: value(formData, "projectId"),
    predecessorTaskId: value(formData, "predecessorTaskId"),
    successorTaskId: value(formData, "successorTaskId"),
    dependencyType: value(formData, "dependencyType"),
  });
  if (!parsed.success)
    fail(
      "/projects",
      parsed.error.issues[0]?.message ?? "Please review the dependency.",
    );
  const data = parsed.data;
  const { project } = await projectFor(data.projectId, "project_tasks.manage");
  const [predecessor, successor, existing] = await Promise.all([
    prisma.projectTask.findUnique({ where: { id: data.predecessorTaskId } }),
    prisma.projectTask.findUnique({ where: { id: data.successorTaskId } }),
    prisma.projectTaskDependency.findMany({ where: { projectId: project.id } }),
  ]);
  if (
    !predecessor ||
    !successor ||
    predecessor.projectId !== project.id ||
    successor.projectId !== project.id
  )
    fail(projectPath(project.id), "Both tasks must belong to this project.");
  if (
    dependencyWouldCycle(existing, data.predecessorTaskId, data.successorTaskId)
  )
    fail(
      projectPath(project.id),
      "That dependency would create a circular task dependency.",
    );
  await prisma.projectTaskDependency.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId: project.id,
      predecessorTaskId: predecessor.id,
      successorTaskId: successor.id,
      dependencyType: data.dependencyType,
      createdBy: actor.id,
      createdAt: new Date(),
    },
  });
  await prisma.projectTask.update({
    where: { id: successor.id },
    data: {
      blocked: true,
      blockedReason: `Waiting on ${predecessor.taskReference}.`,
    },
  });
  await logAudit({
    userId: actor.id,
    action: "projects.dependency.create",
    entityType: "ProjectTaskDependency",
    metadata: data,
    ipAddress: ipAddress(),
  });
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?dependencyCreated=1`);
}

export async function createProjectMilestoneAction(formData: FormData) {
  const actor = await actorFor("project_tasks.manage");
  const parsed = projectMilestoneSchema.safeParse({
    projectId: value(formData, "projectId"),
    name: value(formData, "name"),
    description: value(formData, "description"),
    ownerId: value(formData, "ownerId"),
    plannedDate: value(formData, "plannedDate"),
    completionCriteria: value(formData, "completionCriteria"),
    clientVisible: checked(formData, "clientVisible"),
  });
  if (!parsed.success)
    fail(
      "/projects",
      parsed.error.issues[0]?.message ?? "Please review the milestone.",
    );
  const data = parsed.data;
  const { project } = await projectFor(data.projectId, "project_tasks.manage");
  await employeeReference(data.ownerId || "");
  const milestone = await prisma.projectMilestone.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId: project.id,
      name: data.name,
      description: data.description || null,
      ownerId: data.ownerId || null,
      plannedDate: dateOrNull(data.plannedDate),
      actualCompletionDate: null,
      status: "UPCOMING",
      relatedTaskIds: [],
      completionCriteria: data.completionCriteria || null,
      clientVisible: data.clientVisible,
      healthOverride: null,
      overrideReason: null,
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await logAudit({
    userId: actor.id,
    action: "projects.milestone.create",
    entityType: "ProjectMilestone",
    entityId: milestone.id,
    metadata: { projectId: project.id },
    ipAddress: ipAddress(),
  });
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?milestoneCreated=1`);
}

export async function createProjectCommentAction(formData: FormData) {
  const actor = await actorFor("projects.update");
  const parsed = projectCommentSchema.safeParse({
    projectId: value(formData, "projectId"),
    taskId: value(formData, "taskId"),
    body: value(formData, "body"),
    visibility: value(formData, "visibility") || "PROJECT_TEAM",
    parentCommentId: value(formData, "parentCommentId"),
  });
  if (!parsed.success)
    fail(
      "/projects",
      parsed.error.issues[0]?.message ?? "Please review the comment.",
    );
  const data = parsed.data;
  const { project } = await projectFor(data.projectId, "projects.update");
  if (data.visibility === "CLIENT_VISIBLE" && !project.clientId)
    fail(
      projectPath(project.id),
      "Only client projects can have client-visible comments.",
    );
  const comment = await prisma.projectComment.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId: project.id,
      taskId: data.taskId || null,
      authorId: actor.id,
      body: data.body,
      mentions: [],
      visibility: data.visibility,
      parentCommentId: data.parentCommentId || null,
      editedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await prisma.projectActivity.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId: project.id,
      taskId: data.taskId || null,
      type: "COMMENT_ADDED",
      description: "Added a project comment.",
      actorId: actor.id,
      createdAt: new Date(),
    },
  });
  await logAudit({
    userId: actor.id,
    action: "projects.comment.create",
    entityType: "ProjectComment",
    entityId: comment.id,
    metadata: { projectId: project.id, visibility: data.visibility },
    ipAddress: ipAddress(),
  });
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?commentCreated=1`);
}

export async function createProjectRiskAction(formData: FormData) {
  const actor = await actorFor("project_risks.manage");
  const parsed = projectRiskSchema.safeParse({
    projectId: value(formData, "projectId"),
    type: value(formData, "type"),
    title: value(formData, "title"),
    description: value(formData, "description"),
    probability: value(formData, "probability"),
    impact: value(formData, "impact"),
    ownerId: value(formData, "ownerId"),
    mitigationPlan: value(formData, "mitigationPlan"),
    targetResolutionDate: value(formData, "targetResolutionDate"),
  });
  if (!parsed.success)
    fail(
      "/projects",
      parsed.error.issues[0]?.message ?? "Please review the risk.",
    );
  const data = parsed.data;
  const { project } = await projectFor(data.projectId, "project_risks.manage");
  await employeeReference(data.ownerId || "");
  const risk = await prisma.projectRisk.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId: project.id,
      type: data.type,
      title: data.title,
      description: data.description,
      probability: data.probability,
      impact: data.impact,
      severity: riskSeverity(data.probability, data.impact),
      ownerId: data.ownerId || null,
      mitigationPlan: data.mitigationPlan || null,
      contingencyPlan: null,
      targetResolutionDate: dateOrNull(data.targetResolutionDate),
      status: "OPEN",
      relatedTaskId: null,
      relatedMilestoneId: null,
      relatedTicketId: null,
      createdBy: actor.id,
      updatedBy: actor.id,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await prisma.projectActivity.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId: project.id,
      type: "RISK_CREATED",
      description: `${risk.severity} ${risk.type.toLowerCase()} created.`,
      actorId: actor.id,
      createdAt: new Date(),
    },
  });
  await refreshProjectSummary(project.id, actor.id);
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?riskCreated=1`);
}

export async function logProjectTimeAction(formData: FormData) {
  const actor = await actorFor("project_time.log");
  const actorEmployee = await employeeForAttendance(actor);
  const parsed = projectTimeEntrySchema.safeParse({
    projectId: value(formData, "projectId"),
    taskId: value(formData, "taskId"),
    date: value(formData, "date"),
    durationMinutes: value(formData, "durationMinutes"),
    description: value(formData, "description"),
    billable: checked(formData, "billable"),
    workType: value(formData, "workType"),
    source: value(formData, "source") || "MANUAL",
  });
  if (!parsed.success)
    fail(
      "/projects",
      parsed.error.issues[0]?.message ?? "Please review the time entry.",
    );
  const data = parsed.data;
  const { project } = await projectFor(data.projectId, "project_time.log");
  if (data.taskId) {
    const task = await prisma.projectTask.findUnique({
      where: { id: data.taskId },
    });
    if (!task || task.projectId !== project.id)
      fail(
        projectPath(project.id),
        "Selected task does not belong to this project.",
      );
  }
  const entry = await prisma.projectTimeEntry.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId: project.id,
      taskId: data.taskId || null,
      employeeId: actorEmployee?.id ?? actor.id,
      date: dateOrNull(data.date),
      startAt: null,
      endAt: null,
      durationMinutes: data.durationMinutes,
      description: data.description,
      billable: data.billable,
      workType: data.workType || null,
      approvalState: "DRAFT",
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      source: data.source,
      originalDurationMinutes: data.durationMinutes,
      correctionHistory: [],
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?timeLogged=1`);
}

export async function submitProjectTimeAction(formData: FormData) {
  const actor = await actorFor("project_time.log");
  const actorEmployee = await employeeForAttendance(actor);
  const entryId = value(formData, "entryId");
  const entry = await prisma.projectTimeEntry.findUnique({
    where: { id: entryId },
  });
  if (
    !entry ||
    entry.workspaceId !== workspaceId ||
    entry.employeeId !== (actorEmployee?.id ?? actor.id)
  )
    fail("/projects", "Time entry not found.");
  if (entry.approvalState !== "DRAFT" && entry.approvalState !== "REJECTED")
    fail(projectPath(entry.projectId), "This time entry cannot be submitted.");
  await prisma.projectTimeEntry.update({
    where: { id: entry.id },
    data: {
      approvalState: "SUBMITTED",
      submittedAt: new Date(),
      rejectionReason: null,
      updatedBy: actor.id,
    },
  });
  revalidatePath(projectPath(entry.projectId));
  redirect(`${projectPath(entry.projectId)}?timeSubmitted=1`);
}

export async function decideProjectTimeAction(formData: FormData) {
  const actor = await actorFor("project_time.approve");
  const parsed = projectTimeDecisionSchema.safeParse({
    entryId: value(formData, "entryId"),
    decision: value(formData, "decision"),
    rejectionReason: value(formData, "rejectionReason"),
  });
  if (!parsed.success)
    fail(
      "/projects",
      parsed.error.issues[0]?.message ?? "Please review the decision.",
    );
  const entry = await prisma.projectTimeEntry.findUnique({
    where: { id: parsed.data.entryId },
  });
  if (!entry || entry.workspaceId !== workspaceId)
    fail("/projects", "Time entry not found.");
  if (entry.approvalState !== "SUBMITTED")
    fail(
      projectPath(entry.projectId),
      "Only submitted time can be approved or rejected.",
    );
  if (parsed.data.decision === "REJECT" && !parsed.data.rejectionReason)
    fail(projectPath(entry.projectId), "A rejection reason is required.");
  await firestoreAdmin.runTransaction(async (transaction) => {
    transaction.update(
      firestoreAdmin
        .collection(collectionNames.projectTimeEntries)
        .doc(entry.id),
      {
        approvalState:
          parsed.data.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedBy: parsed.data.decision === "APPROVE" ? actor.id : null,
        approvedAt:
          parsed.data.decision === "APPROVE"
            ? FieldValue.serverTimestamp()
            : null,
        rejectionReason: parsed.data.rejectionReason || null,
        updatedBy: actor.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
    transaction.create(
      firestoreAdmin
        .collection(collectionNames.projectActivities)
        .doc(randomUUID()),
      {
        id: randomUUID(),
        workspaceId,
        projectId: entry.projectId,
        type:
          parsed.data.decision === "APPROVE"
            ? "TIME_APPROVED"
            : "TIME_REJECTED",
        description: `Time entry ${parsed.data.decision.toLowerCase()}.`,
        actorId: actor.id,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  });
  await logAudit({
    userId: actor.id,
    action: `projects.time.${parsed.data.decision.toLowerCase()}`,
    entityType: "ProjectTimeEntry",
    entityId: entry.id,
    metadata: {
      projectId: entry.projectId,
      rejectionReason: parsed.data.rejectionReason || null,
    },
    ipAddress: ipAddress(),
  });
  revalidatePath(projectPath(entry.projectId));
  redirect(`${projectPath(entry.projectId)}?timeDecided=1`);
}

export async function startProjectTimerAction(formData: FormData) {
  const actor = await actorFor("project_time.log");
  const actorEmployee = await employeeForAttendance(actor);
  const employeeId = actorEmployee?.id ?? actor.id;
  const projectId = value(formData, "projectId");
  const taskId = value(formData, "taskId");
  const { project } = await projectFor(projectId, "project_time.log");
  if (taskId) {
    const task = await prisma.projectTask.findUnique({ where: { id: taskId } });
    if (!task || task.projectId !== project.id)
      fail(
        projectPath(project.id),
        "Selected task does not belong to this project.",
      );
  }
  const lockRef = firestoreAdmin
    .collection(collectionNames.projectTimerLocks)
    .doc(`${workspaceId}:${employeeId}`);
  const entryId = randomUUID();
  await firestoreAdmin
    .runTransaction(async (transaction) => {
      const lock = await transaction.get(lockRef);
      if (lock.exists && lock.data()?.status === "ACTIVE")
        throw new Error("TIMER_ALREADY_ACTIVE");
      transaction.create(lockRef, {
        workspaceId,
        employeeId,
        entryId,
        projectId,
        taskId: taskId || null,
        status: "ACTIVE",
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(
        firestoreAdmin
          .collection(collectionNames.projectTimeEntries)
          .doc(entryId),
        {
          id: entryId,
          workspaceId,
          projectId,
          taskId: taskId || null,
          employeeId,
          date: FieldValue.serverTimestamp(),
          startAt: FieldValue.serverTimestamp(),
          endAt: null,
          durationMinutes: 0,
          description: "Task timer entry",
          billable: false,
          workType: "TASK_WORK",
          approvalState: "DRAFT",
          submittedAt: null,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
          source: "TASK_TIMER",
          originalDurationMinutes: 0,
          correctionHistory: [],
          createdBy: actor.id,
          updatedBy: actor.id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      );
    })
    .catch((error: any) => {
      if (error?.message === "TIMER_ALREADY_ACTIVE")
        fail(
          projectPath(project.id),
          "You already have an active project timer.",
        );
      throw error;
    });
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?timerStarted=1`);
}

export async function stopProjectTimerAction(formData: FormData) {
  const actor = await actorFor("project_time.log");
  const actorEmployee = await employeeForAttendance(actor);
  const employeeId = actorEmployee?.id ?? actor.id;
  const lockRef = firestoreAdmin
    .collection(collectionNames.projectTimerLocks)
    .doc(`${workspaceId}:${employeeId}`);
  const lock = await lockRef.get();
  if (!lock.exists || lock.data()?.status !== "ACTIVE")
    fail("/projects", "You do not have an active project timer.");
  const data = lock.data()!;
  const startedAt = data.startedAt?.toDate?.() ?? new Date();
  const durationMinutes = Math.max(
    1,
    Math.round((Date.now() - startedAt.getTime()) / 60000),
  );
  await firestoreAdmin.runTransaction(async (transaction) => {
    transaction.update(
      firestoreAdmin
        .collection(collectionNames.projectTimeEntries)
        .doc(data.entryId),
      {
        endAt: FieldValue.serverTimestamp(),
        durationMinutes,
        originalDurationMinutes: durationMinutes,
        updatedBy: actor.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
    );
    transaction.delete(lockRef);
  });
  revalidatePath(projectPath(data.projectId));
  redirect(`${projectPath(data.projectId)}?timerStopped=1`);
}

export async function addProjectMemberAction(formData: FormData) {
  const actor = await actorFor("project_members.manage");
  const projectId = value(formData, "projectId");
  const { project } = await projectFor(projectId, "project_members.manage");
  const employeeId = value(formData, "employeeId");
  await employeeReference(employeeId);
  const member = await prisma.projectMember.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId,
      employeeId,
      role: value(formData, "role") || "TEAM_MEMBER",
      clientVisible: checked(formData, "clientVisible"),
      active: true,
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await logAudit({
    userId: actor.id,
    action: "projects.member.add",
    entityType: "ProjectMember",
    entityId: member.id,
    metadata: { projectId, employeeId },
    ipAddress: ipAddress(),
  });
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?memberAdded=1`);
}

export async function linkProjectRecordAction(formData: FormData) {
  const actor = await actorFor("projects.update");
  const projectId = value(formData, "projectId");
  const kind = value(formData, "kind");
  const recordId = value(formData, "recordId");
  const { project } = await projectFor(projectId, "projects.update");
  if (!recordId || !["TICKET", "ASSET"].includes(kind))
    fail(projectPath(project.id), "Select a valid link.");
  if (kind === "TICKET") {
    const ticket = await prisma.ticket.findUnique({ where: { id: recordId } });
    if (!ticket || ticket.workspaceId !== workspaceId)
      fail(projectPath(project.id), "Ticket not found.");
    await prisma.projectTicketLink.create({
      data: {
        id: randomUUID(),
        workspaceId,
        projectId,
        ticketId: recordId,
        taskId: value(formData, "taskId") || null,
        createdBy: actor.id,
        createdAt: new Date(),
      },
    });
  } else {
    const asset = await prisma.asset.findUnique({ where: { id: recordId } });
    if (!asset || asset.workspaceId !== workspaceId)
      fail(projectPath(project.id), "Asset not found.");
    await prisma.projectAssetLink.create({
      data: {
        id: randomUUID(),
        workspaceId,
        projectId,
        assetId: recordId,
        taskId: value(formData, "taskId") || null,
        createdBy: actor.id,
        createdAt: new Date(),
      },
    });
  }
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?linkCreated=1`);
}

export async function uploadProjectFileAction(formData: FormData) {
  const actor = await actorFor("project_files.manage");
  const projectId = value(formData, "projectId");
  const { project } = await projectFor(projectId, "project_files.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    fail(projectPath(project.id), "Attach a file before uploading.");
  const validation = validateUpload({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    maxBytes: 25 * 1024 * 1024,
  });
  if (validation) fail(projectPath(project.id), validation);
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFilename(file.name)}`;
  const storagePath = buildWorkspaceStoragePath(
    workspaceId,
    "projects",
    project.id,
    fileName,
  );
  const stored = await savePrivateBinaryToStorage({
    storagePath,
    buffer: Buffer.from(await file.arrayBuffer()),
    contentType: file.type || "application/octet-stream",
  });
  const record = await prisma.projectFile.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId,
      taskId: value(formData, "taskId") || null,
      category: value(formData, "category") || "OTHER",
      description: value(formData, "description") || null,
      originalName: file.name,
      fileName,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      storagePath: stored.storagePath,
      storageProvider: stored.provider,
      clientVisible: checked(formData, "clientVisible"),
      version: 1,
      archivedAt: null,
      uploadedBy: actor.id,
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await logAudit({
    userId: actor.id,
    action: "projects.file.upload",
    entityType: "ProjectFile",
    entityId: record.id,
    metadata: { projectId, clientVisible: record.clientVisible },
    ipAddress: ipAddress(),
  });
  revalidatePath(projectPath(project.id));
  redirect(`${projectPath(project.id)}?fileUploaded=1`);
}

export async function createProjectTemplateAction(formData: FormData) {
  const actor = await actorFor("project_templates.manage");
  const name = value(formData, "name").trim();
  if (name.length < 2) fail("/projects/templates", "A template name is required.");
  const templateId = randomUUID();
  await prisma.projectTemplate.create({ data: { id: templateId, workspaceId, name, description: value(formData, "description") || null, projectType: value(formData, "projectType") || "OTHER", version: 1, defaultPriority: value(formData, "defaultPriority") || "MEDIUM", phases: value(formData, "phases").split(",").map((item) => item.trim()).filter(Boolean), defaultRoles: [], requiredDocuments: [], active: true, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  const taskLines = value(formData, "tasks").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 100);
  for (const [index, title] of taskLines.entries()) await prisma.projectTemplateTask.create({ data: { id: randomUUID(), workspaceId, templateId, title, phase: "Default", estimatedHours: 0, relativeStartDay: index, relativeDueDay: index + 1, defaultStatus: "TODO", defaultPriority: value(formData, "defaultPriority") || "MEDIUM", labels: [], checklist: [], order: index + 1, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  revalidatePath("/projects/templates"); redirect("/projects/templates?created=1");
}

export async function createProjectFromTemplateAction(formData: FormData) {
  const actor = await actorFor("projects.create");
  const templateId = value(formData, "templateId");
  const template = await prisma.projectTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.workspaceId !== workspaceId || !template.active) fail("/projects/templates", "Template not found or inactive.");
  const clientId = value(formData, "clientId"); const siteId = value(formData, "siteId"); const { client, site } = await validateClientAndSite(clientId, siteId);
  const name = value(formData, "name") || template.name; const startDate = value(formData, "plannedStartDate"); if (!startDate) fail("/projects/templates", "A planned start date is required.");
  const taskTemplates = await prisma.projectTemplateTask.findMany({ where: { workspaceId, templateId }, orderBy: { order: "asc" }, take: 100 });
  const projectId = randomUUID(); const projectReference = `PRJ-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`; const dueDate = new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() + Math.max(1, ...taskTemplates.map((task: any) => Number(task.relativeDueDay || 1))) * 86_400_000);
  await firestoreAdmin.runTransaction(async (transaction) => {
    transaction.create(firestoreAdmin.collection(collectionNames.projectUniqueness).doc(`${workspaceId}:${projectReference}`), { workspaceId, projectId, projectReference, createdAt: FieldValue.serverTimestamp() });
    transaction.create(firestoreAdmin.collection(collectionNames.projects).doc(projectId), { id: projectId, workspaceId, projectReference, name, description: template.description || null, projectType: template.projectType, templateId, templateVersion: template.version, status: "DRAFT", priority: template.defaultPriority, classification: client?.id ? "CLIENT" : "INTERNAL", clientId: client?.id ?? null, siteId: site?.id ?? null, managerId: actor.id, ownerId: actor.id, plannedStartDate: new Date(`${startDate}T00:00:00.000Z`), plannedCompletionDate: dueDate, progressPercentage: 0, healthState: "HEALTHY", healthFactors: [], healthCalculationVersion: 1, healthCalculatedAt: new Date(), estimatedHours: taskTemplates.reduce((sum: number, task: any) => sum + Number(task.estimatedHours || 0), 0), billable: Boolean(client?.id), clientPortalVisible: false, archivedAt: null, createdBy: actor.id, updatedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), searchTokens: projectSearchTokens([name, template.projectType, client?.name, projectReference]) });
    transaction.create(firestoreAdmin.collection(collectionNames.projectStatusHistory).doc(randomUUID()), { workspaceId, projectId, fromStatus: null, toStatus: "DRAFT", reason: `Created from template ${template.name} v${template.version}.`, changedBy: actor.id, changedAt: FieldValue.serverTimestamp() });
    for (const task of taskTemplates) { const taskId = randomUUID(); const taskReference = `${projectReference}-T${randomUUID().slice(0, 5).toUpperCase()}`; const taskStart = new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() + Number(task.relativeStartDay || 0) * 86_400_000); const taskDue = new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() + Number(task.relativeDueDay || 1) * 86_400_000); transaction.create(firestoreAdmin.collection(collectionNames.projectTaskUniqueness).doc(`${workspaceId}:${taskReference}`), { workspaceId, projectId, taskId, taskReference, createdAt: FieldValue.serverTimestamp() }); transaction.create(firestoreAdmin.collection(collectionNames.projectTasks).doc(taskId), { id: taskId, workspaceId, projectId, taskReference, title: task.title, description: null, parentTaskId: null, status: task.defaultStatus || "TODO", priority: task.defaultPriority || template.defaultPriority, assigneeId: null, teamId: null, reporterId: actor.id, startDate: taskStart, dueDate: taskDue, estimatedHours: task.estimatedHours || 0, loggedHours: 0, billable: Boolean(client?.id), labels: task.labels || [], checklist: task.checklist || [], progressPercentage: 0, blocked: false, blockedReason: null, createdBy: actor.id, updatedBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); }
  });
  await logAudit({ userId: actor.id, action: "projects.create_from_template", entityType: "Project", entityId: projectId, metadata: { templateId, templateVersion: template.version }, ipAddress: ipAddress() }); revalidatePath("/projects"); redirect(`${projectPath(projectId)}?createdFromTemplate=1`);
}

export async function updateProjectClientVisibilityAction(formData: FormData) {
  const actor = await actorFor("client_projects.manage_visibility");
  const projectId = value(formData, "projectId");
  const { project } = await projectFor(projectId, "client_projects.manage_visibility");
  if (!project.clientId) fail(projectPath(projectId), "Only client projects can be shared with a client portal.");
  const visible = checked(formData, "clientPortalVisible");
  await firestoreAdmin.collection(collectionNames.projects).doc(projectId).update({ clientPortalVisible: visible, updatedBy: actor.id, updatedAt: FieldValue.serverTimestamp() });
  await logAudit({ userId: actor.id, action: "projects.client_visibility.update", entityType: "Project", entityId: projectId, previousValues: { clientPortalVisible: Boolean(project.clientPortalVisible) }, newValues: { clientPortalVisible: visible }, ipAddress: ipAddress() });
  revalidatePath(projectPath(projectId)); redirect(`${projectPath(projectId)}?visibilityUpdated=1`);
}
