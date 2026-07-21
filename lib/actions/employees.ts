"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { firestoreAdmin, prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  departmentFormSchema,
  employeeContractSchema,
  employeeFormSchema,
  employeeNoteSchema,
  employeeStatusSchema,
  emergencyContactSchema,
  qualificationSchema,
  trainingSchema,
  jobTitleFormSchema,
  teamFormSchema,
} from "@/lib/validators";
import { canTransitionEmployeeStatus, ensureEmployeeInWorkspace, hasReportingLoop, parseOptionalDate } from "@/lib/employees";
import { buildWorkspaceStoragePath, sanitizeFilename, savePrivateBinaryToStorage, validateUpload } from "@/lib/storage";

const workspaceId = env.DEFAULT_WORKSPACE_ID;

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function actorFor(permission: string) {
  const actor = await currentUser();
  if (!actor) redirect("/login");
  if (!actor.permissions.includes(permission)) redirect("/access-denied");
  return actor;
}

function ipAddress() {
  return headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers().get("x-real-ip") ?? null;
}

function employeePayload(formData: FormData) {
  return {
    employeeNumber: formData.get("employeeNumber"),
    firstName: formData.get("firstName"),
    middleNames: formData.get("middleNames"),
    lastName: formData.get("lastName"),
    preferredName: formData.get("preferredName"),
    workEmail: formData.get("workEmail"),
    personalEmail: formData.get("personalEmail"),
    mobileNumber: formData.get("mobileNumber"),
    alternativePhone: formData.get("alternativePhone"),
    identityReference: formData.get("identityReference"),
    nationality: formData.get("nationality"),
    preferredLanguage: formData.get("preferredLanguage"),
    status: formData.get("status"),
    employmentType: formData.get("employmentType"),
    jobTitle: formData.get("jobTitle"),
    departmentId: formData.get("departmentId"),
    teamId: formData.get("teamId"),
    managerId: formData.get("managerId"),
    secondaryManagerId: formData.get("secondaryManagerId"),
    workLocation: formData.get("workLocation"),
    workingArrangement: formData.get("workingArrangement"),
    startDate: formData.get("startDate"),
    probationEndDate: formData.get("probationEndDate"),
    contractEndDate: formData.get("contractEndDate"),
    terminationDate: formData.get("terminationDate"),
    terminationReason: formData.get("terminationReason"),
    noticePeriodDays: formData.get("noticePeriodDays") || 0,
    standardHours: formData.get("standardHours"),
    costCentre: formData.get("costCentre"),
    internalNotes: formData.get("internalNotes"),
  };
}

function clean(value: string | undefined | null) {
  return value?.trim() || null;
}

async function assertReferences(data: { departmentId?: string; teamId?: string; managerId?: string; secondaryManagerId?: string }, employeeId?: string) {
  const ids = [data.departmentId, data.teamId, data.managerId, data.secondaryManagerId].filter(Boolean) as string[];
  if (ids.length === 0) return;
  const [department, team, manager, secondaryManager] = await Promise.all([
    data.departmentId ? prisma.department.findUnique({ where: { id: data.departmentId } }) : null,
    data.teamId ? prisma.team.findUnique({ where: { id: data.teamId } }) : null,
    data.managerId ? ensureEmployeeInWorkspace(data.managerId, workspaceId) : null,
    data.secondaryManagerId ? ensureEmployeeInWorkspace(data.secondaryManagerId, workspaceId) : null,
  ]);
  if (data.departmentId && (!department || department.workspaceId !== workspaceId || department.archivedAt)) fail("/employees/new", "The selected department is not available.");
  if (data.teamId && (!team || team.workspaceId !== workspaceId || team.archivedAt)) fail("/employees/new", "The selected team is not available.");
  if (data.managerId && !manager) fail("/employees/new", "The selected manager is not available.");
  if (data.secondaryManagerId && !secondaryManager) fail("/employees/new", "The selected secondary manager is not available.");
  if (employeeId && data.managerId && await hasReportingLoop(employeeId, data.managerId, workspaceId)) fail(`/employees/${employeeId}`, "That manager would create a reporting loop.");
}

export async function createEmployeeAction(formData: FormData) {
  const actor = await actorFor("employees.create");
  const parsed = employeeFormSchema.safeParse(employeePayload(formData));
  if (!parsed.success) fail("/employees/new", parsed.error.issues[0]?.message ?? "Please review the employee details.");
  const data = parsed.data;
  await assertReferences(data);

  const employeeId = randomUUID();
  const email = data.workEmail.toLowerCase();
  const employeeRef = firestoreAdmin.collection("employees").doc(employeeId);
  const numberKey = firestoreAdmin.collection("employeeUniqueness").doc(`${workspaceId}_number_${data.employeeNumber.toLowerCase()}`);
  const emailKey = firestoreAdmin.collection("employeeUniqueness").doc(`${workspaceId}_email_${email}`);
  await firestoreAdmin.runTransaction(async (transaction) => {
    const [numberSnapshot, emailSnapshot] = await Promise.all([transaction.get(numberKey), transaction.get(emailKey)]);
    if (numberSnapshot.exists) throw new Error("EMPLOYEE_NUMBER_EXISTS");
    if (emailSnapshot.exists) throw new Error("WORK_EMAIL_EXISTS");
    const now = new Date();
    transaction.set(employeeRef, {
      workspaceId,
      employeeNumber: data.employeeNumber,
      firstName: data.firstName,
      middleNames: clean(data.middleNames),
      lastName: data.lastName,
      preferredName: clean(data.preferredName),
      workEmail: email,
      personalEmail: clean(data.personalEmail),
      mobileNumber: clean(data.mobileNumber),
      alternativePhone: clean(data.alternativePhone),
      identityReference: clean(data.identityReference),
      identityReferenceMasked: data.identityReference ? `••••${data.identityReference.slice(-4)}` : null,
      nationality: clean(data.nationality),
      preferredLanguage: clean(data.preferredLanguage),
      status: data.status,
      employmentType: data.employmentType,
      jobTitle: clean(data.jobTitle),
      departmentId: clean(data.departmentId),
      teamId: clean(data.teamId),
      managerId: clean(data.managerId),
      secondaryManagerId: clean(data.secondaryManagerId),
      workLocation: clean(data.workLocation),
      workingArrangement: clean(data.workingArrangement),
      startDate: parseOptionalDate(data.startDate),
      probationEndDate: parseOptionalDate(data.probationEndDate),
      contractEndDate: parseOptionalDate(data.contractEndDate),
      terminationDate: parseOptionalDate(data.terminationDate),
      terminationReason: clean(data.terminationReason),
      noticePeriodDays: data.noticePeriodDays,
      standardHours: clean(data.standardHours),
      costCentre: clean(data.costCentre),
      internalNotes: clean(data.internalNotes),
      userId: null,
      accountState: "NOT_LINKED",
      assignedAssetCount: 0,
      assignedEndpointCount: 0,
      openTicketCount: 0,
      createdBy: actor.id,
      updatedBy: actor.id,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      retentionState: "ACTIVE",
    });
    transaction.create(numberKey, { workspaceId, kind: "employeeNumber", value: data.employeeNumber.toLowerCase(), employeeId, createdAt: now });
    transaction.create(emailKey, { workspaceId, kind: "workEmail", value: email, employeeId, createdAt: now });
  }).catch((error: any) => {
    if (error?.message === "EMPLOYEE_NUMBER_EXISTS") fail("/employees/new", "That employee number is already in use.");
    if (error?.message === "WORK_EMAIL_EXISTS") fail("/employees/new", "That work email is already in use.");
    throw error;
  });

  await Promise.all([
    prisma.employeeStatusHistory.create({ data: { workspaceId, employeeId, fromStatus: null, toStatus: data.status, effectiveDate: parseOptionalDate(data.startDate) ?? new Date(), reason: "Employee record created", actorId: actor.id, createdAt: new Date() } }),
    logAudit({ userId: actor.id, action: "employees.create", entityType: "Employee", entityId: employeeId, newValues: { employeeNumber: data.employeeNumber, workEmail: email, status: data.status, employmentType: data.employmentType }, ipAddress: ipAddress() }),
  ]);
  revalidatePath("/employees");
  redirect(`/employees/${employeeId}?created=1`);
}

export async function updateEmployeeAction(formData: FormData) {
  const actor = await actorFor("employees.update");
  const employeeId = String(formData.get("employeeId") ?? "");
  const parsed = employeeFormSchema.safeParse(employeePayload(formData));
  if (!employeeId) fail("/employees", "Missing employee identifier.");
  if (!parsed.success) fail(`/employees/${employeeId}`, parsed.error.issues[0]?.message ?? "Please review the employee details.");
  const data = parsed.data;
  const existing = await ensureEmployeeInWorkspace(employeeId, workspaceId);
  if (!existing) fail("/employees", "The employee record could not be found.");
  await assertReferences(data, employeeId);
  if (existing!.status !== data.status && !canTransitionEmployeeStatus(existing!.status, data.status)) fail(`/employees/${employeeId}`, `Cannot move an employee from ${existing!.status} to ${data.status}.`);

  const update = {
    ...data,
    workEmail: data.workEmail.toLowerCase(),
    middleNames: clean(data.middleNames), preferredName: clean(data.preferredName), personalEmail: clean(data.personalEmail), mobileNumber: clean(data.mobileNumber), alternativePhone: clean(data.alternativePhone), identityReference: clean(data.identityReference), identityReferenceMasked: data.identityReference ? `••••${data.identityReference.slice(-4)}` : null, nationality: clean(data.nationality), preferredLanguage: clean(data.preferredLanguage), jobTitle: clean(data.jobTitle), departmentId: clean(data.departmentId), teamId: clean(data.teamId), managerId: clean(data.managerId), secondaryManagerId: clean(data.secondaryManagerId), workLocation: clean(data.workLocation), workingArrangement: clean(data.workingArrangement), startDate: parseOptionalDate(data.startDate), probationEndDate: parseOptionalDate(data.probationEndDate), contractEndDate: parseOptionalDate(data.contractEndDate), terminationDate: parseOptionalDate(data.terminationDate), terminationReason: clean(data.terminationReason), standardHours: clean(data.standardHours), costCentre: clean(data.costCentre), internalNotes: clean(data.internalNotes), updatedBy: actor.id,
  };
  if (update.workEmail !== existing!.workEmail.toLowerCase()) {
    const conflict = await prisma.employee.findFirst({ where: { workspaceId, workEmail: update.workEmail, NOT: { id: employeeId } } });
    if (conflict) fail(`/employees/${employeeId}`, "That work email is already in use.");
  }
  if (update.employeeNumber !== existing!.employeeNumber) {
    const conflict = await prisma.employee.findFirst({ where: { workspaceId, employeeNumber: update.employeeNumber, NOT: { id: employeeId } } });
    if (conflict) fail(`/employees/${employeeId}`, "That employee number is already in use.");
  }
  await prisma.employee.update({ where: { id: employeeId }, data: update });
  await logAudit({ userId: actor.id, action: "employees.update", entityType: "Employee", entityId: employeeId, previousValues: { status: existing!.status, managerId: existing!.managerId, departmentId: existing!.departmentId }, newValues: { status: update.status, managerId: update.managerId, departmentId: update.departmentId }, ipAddress: ipAddress() });
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  redirect(`/employees/${employeeId}?updated=1`);
}

export async function changeEmployeeStatusAction(formData: FormData) {
  const actor = await actorFor("employees.update");
  const parsed = employeeStatusSchema.safeParse({ employeeId: formData.get("employeeId"), status: formData.get("status"), effectiveDate: formData.get("effectiveDate"), reason: formData.get("reason") });
  if (!parsed.success) fail(`/employees/${String(formData.get("employeeId") ?? "")}`, parsed.error.issues[0]?.message ?? "Please review the status change.");
  const data = parsed.data;
  const employee = await ensureEmployeeInWorkspace(data.employeeId, workspaceId);
  if (!employee) fail("/employees", "The employee record could not be found.");
  if (employee!.status !== data.status && !canTransitionEmployeeStatus(employee!.status, data.status)) fail(`/employees/${data.employeeId}`, "That status transition is not permitted.");
  if (["SUSPENDED", "NOTICE_PERIOD", "TERMINATED", "FORMER_EMPLOYEE"].includes(data.status) && !data.reason) fail(`/employees/${data.employeeId}`, "A reason is required for this status change.");
  await prisma.employee.update({ where: { id: data.employeeId }, data: { status: data.status, terminationDate: ["TERMINATED", "FORMER_EMPLOYEE"].includes(data.status) ? parseOptionalDate(data.effectiveDate) ?? new Date() : employee!.terminationDate, terminationReason: data.reason || employee!.terminationReason, updatedBy: actor.id } });
  await prisma.employeeStatusHistory.create({ data: { workspaceId, employeeId: data.employeeId, fromStatus: employee!.status, toStatus: data.status, effectiveDate: parseOptionalDate(data.effectiveDate) ?? new Date(), reason: data.reason || null, actorId: actor.id, createdAt: new Date() } });
  await logAudit({ userId: actor.id, action: "employees.status_changed", entityType: "Employee", entityId: data.employeeId, previousValues: { status: employee!.status }, newValues: { status: data.status, reason: data.reason || null }, ipAddress: ipAddress() });
  revalidatePath("/employees");
  revalidatePath(`/employees/${data.employeeId}`);
  redirect(`/employees/${data.employeeId}?statusChanged=1`);
}

export async function createDepartmentAction(formData: FormData) {
  const actor = await actorFor("departments.manage");
  const parsed = departmentFormSchema.safeParse({ name: formData.get("name"), code: String(formData.get("code") ?? "").toUpperCase(), description: formData.get("description"), headId: formData.get("headId"), parentDepartmentId: formData.get("parentDepartmentId"), costCentre: formData.get("costCentre") });
  if (!parsed.success) fail("/employees/organisation", parsed.error.issues[0]?.message ?? "Please review the department.");
  const data = parsed.data;
  const existing = await prisma.department.findFirst({ where: { workspaceId, code: data.code } });
  if (existing) fail("/employees/organisation", "That department code is already in use.");
  if (data.parentDepartmentId === data.headId) fail("/employees/organisation", "A department cannot use itself as a parent.");
  const record = await prisma.department.create({ data: { workspaceId, name: data.name, code: data.code, description: clean(data.description), headId: clean(data.headId), parentDepartmentId: clean(data.parentDepartmentId), costCentre: clean(data.costCentre), active: true, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date(), archivedAt: null } });
  await logAudit({ userId: actor.id, action: "departments.create", entityType: "Department", entityId: record.id, newValues: { name: data.name, code: data.code }, ipAddress: ipAddress() });
  revalidatePath("/employees");
  revalidatePath("/employees/organisation");
  redirect("/employees/organisation?created=1");
}

export async function createTeamAction(formData: FormData) {
  const actor = await actorFor("teams.manage");
  const parsed = teamFormSchema.safeParse({ name: formData.get("name"), description: formData.get("description"), departmentId: formData.get("departmentId"), leaderId: formData.get("leaderId") });
  if (!parsed.success) fail("/employees/organisation", parsed.error.issues[0]?.message ?? "Please review the team.");
  const data = parsed.data;
  const department = await prisma.department.findUnique({ where: { id: data.departmentId } });
  if (!department || department.workspaceId !== workspaceId || department.archivedAt) fail("/employees/organisation", "The selected department is not available.");
  const record = await prisma.team.create({ data: { workspaceId, name: data.name, description: clean(data.description), departmentId: data.departmentId, leaderId: clean(data.leaderId), active: true, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date(), archivedAt: null } });
  await logAudit({ userId: actor.id, action: "teams.create", entityType: "Team", entityId: record.id, newValues: { name: data.name, departmentId: data.departmentId }, ipAddress: ipAddress() });
  revalidatePath("/employees/organisation");
  redirect("/employees/organisation?teamCreated=1");
}

export async function createJobTitleAction(formData: FormData) {
  const actor = await actorFor("job_titles.manage");
  const parsed = jobTitleFormSchema.safeParse({ name: formData.get("name"), description: formData.get("description"), departmentId: formData.get("departmentId"), seniority: formData.get("seniority") });
  if (!parsed.success) fail("/employees/organisation", parsed.error.issues[0]?.message ?? "Please review the job title.");
  const data = parsed.data;
  const record = await prisma.jobTitle.create({ data: { workspaceId, name: data.name, description: clean(data.description), departmentId: clean(data.departmentId), seniority: clean(data.seniority), active: true, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date(), archivedAt: null } });
  await logAudit({ userId: actor.id, action: "job_titles.create", entityType: "JobTitle", entityId: record.id, newValues: { name: data.name, departmentId: data.departmentId }, ipAddress: ipAddress() });
  revalidatePath("/employees/organisation");
  redirect("/employees/organisation?jobTitleCreated=1");
}

async function ensureChildAccess(employeeId: string, permission: string) {
  const actor = await actorFor(permission);
  const employee = await ensureEmployeeInWorkspace(employeeId, workspaceId);
  if (!employee) fail("/employees", "The employee record could not be found.");
  return { actor, employee: employee! };
}

export async function createEmergencyContactAction(formData: FormData) {
  const parsed = emergencyContactSchema.safeParse({ employeeId: formData.get("employeeId"), fullName: formData.get("fullName"), relationship: formData.get("relationship"), primaryPhone: formData.get("primaryPhone"), alternativePhone: formData.get("alternativePhone"), email: formData.get("email"), address: formData.get("address"), primary: formData.get("primary") === "true", notes: formData.get("notes") });
  if (!parsed.success) fail(`/employees/${String(formData.get("employeeId") ?? "")}`, parsed.error.issues[0]?.message ?? "Please review the emergency contact.");
  const data = parsed.data;
  const { actor, employee } = await ensureChildAccess(data.employeeId, "employee_emergency_contacts.manage");
  if (data.primary) await prisma.employeeEmergencyContact.updateMany({ where: { workspaceId, employeeId: employee.id, primary: true }, data: { primary: false, updatedAt: new Date() } });
  const record = await prisma.employeeEmergencyContact.create({ data: { workspaceId, employeeId: employee.id, fullName: data.fullName, relationship: data.relationship, primaryPhone: data.primaryPhone, alternativePhone: clean(data.alternativePhone), email: clean(data.email), address: clean(data.address), primary: data.primary, notes: clean(data.notes), createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "employees.emergency_contact_created", entityType: "EmployeeEmergencyContact", entityId: record.id, metadata: { employeeId: employee.id }, ipAddress: ipAddress() });
  revalidatePath(`/employees/${employee.id}`);
  redirect(`/employees/${employee.id}?contactCreated=1`);
}

export async function createContractAction(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");
  const parsed = employeeContractSchema.safeParse({ employeeId, contractReference: formData.get("contractReference"), contractType: formData.get("contractType"), startDate: formData.get("startDate"), endDate: formData.get("endDate"), probationPeriodDays: formData.get("probationPeriodDays") || 0, noticePeriodDays: formData.get("noticePeriodDays") || 0, workingHours: formData.get("workingHours"), workLocation: formData.get("workLocation"), jobTitle: formData.get("jobTitle"), departmentId: formData.get("departmentId"), managerId: formData.get("managerId"), compensationSummary: formData.get("compensationSummary"), status: formData.get("status"), signedDate: formData.get("signedDate"), renewalDate: formData.get("renewalDate"), renewalType: formData.get("renewalType"), internalNotes: formData.get("internalNotes") });
  if (!parsed.success) fail(`/employees/${employeeId}`, parsed.error.issues[0]?.message ?? "Please review the contract.");
  const data = parsed.data;
  const { actor, employee } = await ensureChildAccess(employeeId, "employee_contracts.manage");
  if (!actor.permissions.includes("employees.compensation_view")) data.compensationSummary = "Restricted";
  const existing = await prisma.employeeContract.findFirst({ where: { workspaceId, contractReference: data.contractReference } });
  if (existing) fail(`/employees/${employeeId}`, "That contract reference is already in use.");
  const { employeeId: _contractEmployeeId, ...contractData } = data;
  const record = await prisma.employeeContract.create({ data: { workspaceId, employeeId: employee.id, ...contractData, startDate: parseOptionalDate(data.startDate) ?? new Date(), endDate: parseOptionalDate(data.endDate), signedDate: parseOptionalDate(data.signedDate), renewalDate: parseOptionalDate(data.renewalDate), departmentId: clean(data.departmentId), managerId: clean(data.managerId), compensationSummary: clean(data.compensationSummary), internalNotes: clean(data.internalNotes), createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "employee_contracts.create", entityType: "EmployeeContract", entityId: record.id, metadata: { employeeId: employee.id, contractReference: data.contractReference }, ipAddress: ipAddress() });
  revalidatePath(`/employees/${employee.id}`);
  redirect(`/employees/${employee.id}?contractCreated=1`);
}

export async function createQualificationAction(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");
  const parsed = qualificationSchema.safeParse({ employeeId, name: formData.get("name"), institution: formData.get("institution"), qualificationType: formData.get("qualificationType"), fieldOfStudy: formData.get("fieldOfStudy"), issueDate: formData.get("issueDate"), completionDate: formData.get("completionDate"), expiryDate: formData.get("expiryDate"), certificateNumber: formData.get("certificateNumber"), verificationStatus: formData.get("verificationStatus"), notes: formData.get("notes") });
  if (!parsed.success) fail(`/employees/${employeeId}`, parsed.error.issues[0]?.message ?? "Please review the qualification.");
  const data = parsed.data;
  const { actor, employee } = await ensureChildAccess(employeeId, "employee_qualifications.manage");
  const { employeeId: _qualificationEmployeeId, ...qualificationData } = data;
  const record = await prisma.employeeQualification.create({ data: { workspaceId, employeeId: employee.id, ...qualificationData, issueDate: parseOptionalDate(data.issueDate), completionDate: parseOptionalDate(data.completionDate), expiryDate: parseOptionalDate(data.expiryDate), institution: clean(data.institution), qualificationType: clean(data.qualificationType), fieldOfStudy: clean(data.fieldOfStudy), certificateNumber: clean(data.certificateNumber), notes: clean(data.notes), createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "employee_qualifications.create", entityType: "EmployeeQualification", entityId: record.id, metadata: { employeeId: employee.id, name: data.name }, ipAddress: ipAddress() });
  revalidatePath(`/employees/${employee.id}`);
  redirect(`/employees/${employee.id}?qualificationCreated=1`);
}

export async function createTrainingAction(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");
  const parsed = trainingSchema.safeParse({ employeeId, name: formData.get("name"), provider: formData.get("provider"), category: formData.get("category"), assignedDate: formData.get("assignedDate"), dueDate: formData.get("dueDate"), completionDate: formData.get("completionDate"), completionStatus: formData.get("completionStatus"), score: formData.get("score") || undefined, expiryDate: formData.get("expiryDate"), required: formData.get("required") === "true", notes: formData.get("notes") });
  if (!parsed.success) fail(`/employees/${employeeId}`, parsed.error.issues[0]?.message ?? "Please review the training record.");
  const data = parsed.data;
  const { actor, employee } = await ensureChildAccess(employeeId, "employee_training.manage");
  const { employeeId: _trainingEmployeeId, ...trainingData } = data;
  const record = await prisma.employeeTraining.create({ data: { workspaceId, employeeId: employee.id, ...trainingData, provider: clean(data.provider), category: clean(data.category), assignedDate: parseOptionalDate(data.assignedDate), dueDate: parseOptionalDate(data.dueDate), completionDate: parseOptionalDate(data.completionDate), expiryDate: parseOptionalDate(data.expiryDate), createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "employee_training.create", entityType: "EmployeeTraining", entityId: record.id, metadata: { employeeId: employee.id, name: data.name }, ipAddress: ipAddress() });
  revalidatePath(`/employees/${employee.id}`);
  redirect(`/employees/${employee.id}?trainingCreated=1`);
}

export async function createEmployeeNoteAction(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");
  const parsed = employeeNoteSchema.safeParse({ employeeId, category: formData.get("category"), visibility: formData.get("visibility"), body: formData.get("body"), pinned: formData.get("pinned") === "true" });
  if (!parsed.success) fail(`/employees/${employeeId}`, parsed.error.issues[0]?.message ?? "Please review the note.");
  const data = parsed.data;
  const permission = data.visibility === "RESTRICTED" || data.category === "HR" ? "employee_notes.manage" : "employee_notes.manage";
  const { actor, employee } = await ensureChildAccess(employeeId, permission);
  const record = await prisma.employeeNote.create({ data: { workspaceId, employeeId: employee.id, authorId: actor.id, category: data.category, visibility: data.visibility, body: data.body, pinned: data.pinned, edited: false, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "employee_notes.create", entityType: "EmployeeNote", entityId: record.id, metadata: { employeeId: employee.id, category: data.category, visibility: data.visibility }, ipAddress: ipAddress() });
  revalidatePath(`/employees/${employee.id}`);
  redirect(`/employees/${employee.id}?noteCreated=1`);
}

export async function uploadEmployeeDocumentAction(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "");
  const { actor, employee } = await ensureChildAccess(employeeId, "employee_documents.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail(`/employees/${employeeId}`, "Choose a document before uploading.");
  const document = file as File;
  const validationError = validateUpload({ fileName: document.name, mimeType: document.type || "application/octet-stream", sizeBytes: document.size, maxBytes: env.EMPLOYEE_DOCUMENT_MAX_MB * 1024 * 1024 });
  if (validationError) fail(`/employees/${employeeId}`, validationError);
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFilename(document.name)}`;
  const storagePath = buildWorkspaceStoragePath(workspaceId, "employees", employeeId, "documents", fileName);
  const stored = await savePrivateBinaryToStorage({ storagePath, buffer: Buffer.from(await document.arrayBuffer()), contentType: document.type || "application/octet-stream" });
  const record = await prisma.employeeDocument.create({ data: { workspaceId, employeeId, documentType: String(formData.get("documentType") || "OTHER"), title: String(formData.get("title") || document.name).trim().slice(0, 180), description: clean(String(formData.get("description") || "")), storagePath: stored.storagePath, storageProvider: stored.provider, issueDate: parseOptionalDate(String(formData.get("issueDate") || "")), expiryDate: parseOptionalDate(String(formData.get("expiryDate") || "")), confidentiality: String(formData.get("confidentiality") || "STANDARD_HR"), fileName, originalName: document.name, mimeType: document.type || "application/octet-stream", fileSize: document.size, uploadedBy: actor.id, uploadedAt: new Date(), lastViewedAt: null, archivedAt: null, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  await logAudit({ userId: actor.id, action: "employee_documents.upload", entityType: "EmployeeDocument", entityId: record.id, metadata: { employeeId, documentType: record.documentType, confidentiality: record.confidentiality }, ipAddress: ipAddress() });
  revalidatePath(`/employees/${employee.id}`);
  redirect(`/employees/${employee.id}?documentUploaded=1`);
}

export async function startOnboardingAction(formData: FormData) {
  const actor = await actorFor("onboarding.manage");
  const employeeId = String(formData.get("employeeId") ?? "");
  const employee = await ensureEmployeeInWorkspace(employeeId, workspaceId);
  if (!employee) fail("/employees", "The employee record could not be found.");
  const existing = await prisma.onboardingWorkflow.findFirst({ where: { workspaceId, employeeId, status: { in: ["ACTIVE", "IN_PROGRESS"] } } });
  if (existing) fail(`/employees/${employeeId}`, "This employee already has an onboarding workflow.");
  const workflow = await prisma.onboardingWorkflow.create({ data: { workspaceId, employeeId, status: "IN_PROGRESS", ownerId: actor.id, startedAt: new Date(), completedAt: null, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  const tasks = ["Confirm employee record", "Upload signed contract", "Create SourceHub account", "Assign required assets", "Configure endpoint and MFA", "Complete security training", "Confirm emergency contact", "Schedule probation review"];
  await prisma.onboardingTask.createMany({ data: tasks.map((title, index) => ({ workspaceId, employeeId, workflowId: workflow.id, title, status: "NOT_STARTED", order: index + 1, required: true, dueDate: new Date(Date.now() + (index + 1) * 86400000), ownerId: actor.id, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() })) });
  await prisma.employee.update({ where: { id: employeeId }, data: { status: employee!.status === "PREBOARDING" ? "PREBOARDING" : employee!.status, updatedBy: actor.id } });
  await logAudit({ userId: actor.id, action: "onboarding.start", entityType: "OnboardingWorkflow", entityId: workflow.id, metadata: { employeeId, taskCount: tasks.length }, ipAddress: ipAddress() });
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees/onboarding");
  redirect(`/employees/${employeeId}?onboardingStarted=1`);
}

export async function startOffboardingAction(formData: FormData) {
  const actor = await actorFor("offboarding.manage");
  const employeeId = String(formData.get("employeeId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) fail(`/employees/${employeeId}`, "An offboarding reason is required.");
  const employee = await ensureEmployeeInWorkspace(employeeId, workspaceId);
  if (!employee) fail("/employees", "The employee record could not be found.");
  const existing = await prisma.offboardingWorkflow.findFirst({ where: { workspaceId, employeeId, status: { in: ["ACTIVE", "IN_PROGRESS"] } } });
  if (existing) fail(`/employees/${employeeId}`, "This employee already has an offboarding workflow.");
  const workflow = await prisma.offboardingWorkflow.create({ data: { workspaceId, employeeId, status: "IN_PROGRESS", reason, ownerId: actor.id, scheduledDate: parseOptionalDate(String(formData.get("scheduledDate") ?? "")) ?? new Date(), startedAt: new Date(), completedAt: null, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() } });
  const tasks = ["Confirm final working date", "Disable SourceHub account", "Revoke endpoint enrolments", "Recover assigned assets", "Review open tickets", "Remove access groups", "Upload termination documentation", "Final approval"];
  await prisma.offboardingTask.createMany({ data: tasks.map((title, index) => ({ workspaceId, employeeId, workflowId: workflow.id, title, status: "NOT_STARTED", order: index + 1, required: true, dueDate: new Date(Date.now() + index * 86400000), ownerId: actor.id, createdBy: actor.id, updatedBy: actor.id, createdAt: new Date(), updatedAt: new Date() })) });
  await prisma.employee.update({ where: { id: employeeId }, data: { status: "NOTICE_PERIOD", terminationReason: reason, updatedBy: actor.id } });
  await logAudit({ userId: actor.id, action: "offboarding.start", entityType: "OffboardingWorkflow", entityId: workflow.id, metadata: { employeeId, reason }, ipAddress: ipAddress() });
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees/offboarding");
  redirect(`/employees/${employeeId}?offboardingStarted=1`);
}

export async function completeOnboardingTaskAction(formData: FormData) {
  const actor = await actorFor("onboarding.manage");
  const taskId = String(formData.get("taskId") ?? "");
  const task = await prisma.onboardingTask.findUnique({ where: { id: taskId } });
  if (!task || task.workspaceId !== workspaceId) fail("/employees/onboarding", "The onboarding task could not be found.");
  const priorTasks = await prisma.onboardingTask.findMany({ where: { workspaceId, workflowId: task.workflowId } });
  if (priorTasks.some((item: any) => item.order < task.order && item.required && item.status !== "COMPLETED")) fail(`/employees/${task.employeeId}`, "Complete earlier required onboarding tasks first.");
  await prisma.onboardingTask.update({ where: { id: task.id }, data: { status: "COMPLETED", completedAt: new Date(), completedBy: actor.id, completionNotes: String(formData.get("notes") || "").trim() || null, updatedBy: actor.id } });
  const remaining = priorTasks.filter((item: any) => item.id !== task.id && item.status !== "COMPLETED" && item.status !== "SKIPPED");
  if (remaining.length === 0) await prisma.onboardingWorkflow.update({ where: { id: task.workflowId }, data: { status: "COMPLETED", completedAt: new Date(), updatedBy: actor.id } });
  await logAudit({ userId: actor.id, action: "onboarding.task_completed", entityType: "OnboardingTask", entityId: task.id, metadata: { employeeId: task.employeeId, workflowId: task.workflowId }, ipAddress: ipAddress() });
  revalidatePath("/employees/onboarding"); revalidatePath(`/employees/${task.employeeId}`);
  redirect(`/employees/${task.employeeId}?onboardingTaskCompleted=1`);
}

export async function completeOffboardingTaskAction(formData: FormData) {
  const actor = await actorFor("offboarding.manage");
  const taskId = String(formData.get("taskId") ?? "");
  const task = await prisma.offboardingTask.findUnique({ where: { id: taskId } });
  if (!task || task.workspaceId !== workspaceId) fail("/employees/offboarding", "The offboarding task could not be found.");
  const employee = await ensureEmployeeInWorkspace(task.employeeId, workspaceId);
  if (!employee) fail("/employees/offboarding", "The employee record could not be found.");
  const priorTasks = await prisma.offboardingTask.findMany({ where: { workspaceId, workflowId: task.workflowId } });
  if (priorTasks.some((item: any) => item.order < task.order && item.required && item.status !== "COMPLETED")) fail(`/employees/${task.employeeId}`, "Complete earlier required offboarding tasks first.");
  const assets = employee!.userId ? await prisma.asset.findMany({ where: { workspaceId, assignedUserId: employee!.userId, status: { notIn: ["ARCHIVED", "DISPOSED"] } } }) : [];
  if (task.title.toLowerCase().includes("recover") && assets.length > 0 && !String(formData.get("overrideReason") || "").trim()) fail(`/employees/${task.employeeId}`, "Return assigned assets or provide an authorised override reason.");
  await prisma.offboardingTask.update({ where: { id: task.id }, data: { status: "COMPLETED", completedAt: new Date(), completedBy: actor.id, completionNotes: String(formData.get("notes") || formData.get("overrideReason") || "").trim() || null, overrideReason: String(formData.get("overrideReason") || "").trim() || null, updatedBy: actor.id } });
  const remaining = priorTasks.filter((item: any) => item.id !== task.id && item.status !== "COMPLETED" && item.status !== "SKIPPED");
  if (remaining.length === 0) { await prisma.offboardingWorkflow.update({ where: { id: task.workflowId }, data: { status: "COMPLETED", completedAt: new Date(), updatedBy: actor.id } }); await prisma.employee.update({ where: { id: employee!.id }, data: { status: "FORMER_EMPLOYEE", updatedBy: actor.id } }); }
  await logAudit({ userId: actor.id, action: "offboarding.task_completed", entityType: "OffboardingTask", entityId: task.id, metadata: { employeeId: task.employeeId, workflowId: task.workflowId, override: Boolean(String(formData.get("overrideReason") || "").trim()) }, ipAddress: ipAddress() });
  revalidatePath("/employees/offboarding"); revalidatePath(`/employees/${task.employeeId}`);
  redirect(`/employees/${task.employeeId}?offboardingTaskCompleted=1`);
}
