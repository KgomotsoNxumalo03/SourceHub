import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

type RecordData = Record<string, any>;

const serviceAccountPath =
  process.env.SOURCEHUB_FIREBASE_SERVICE_ACCOUNT_PATH ??
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
  join(process.cwd(), "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

const adminApp =
  getApps()[0] ??
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

export { adminApp };
export const firestoreAdmin = getFirestore(adminApp);

const collections = {
  user: "users",
  role: "roles",
  permission: "permissions",
  userRole: "userRoles",
  rolePermission: "rolePermissions",
  session: "sessions",
  auditLog: "auditLogs",
  notification: "notifications",
  setting: "settings",
  ticketCategory: "ticketCategories",
  employee: "employees",
  department: "departments",
  team: "teams",
  jobTitle: "jobTitles",
  employeeContract: "employeeContracts",
  employeeDocument: "employeeDocuments",
  employeeEmergencyContact: "employeeEmergencyContacts",
  employeeQualification: "employeeQualifications",
  employeeTraining: "employeeTraining",
  onboardingTemplate: "onboardingTemplates",
  onboardingWorkflow: "onboardingWorkflows",
  onboardingTask: "onboardingTasks",
  offboardingTemplate: "offboardingTemplates",
  offboardingWorkflow: "offboardingWorkflows",
  offboardingTask: "offboardingTasks",
  employeeNote: "employeeNotes",
  employeeActivity: "employeeActivities",
  employeeStatusHistory: "employeeStatusHistory",
  employeeManagerHistory: "employeeManagerHistory",
  employeeUniqueness: "employeeUniqueness",
  attendanceProfile: "attendanceProfiles",
  workLocation: "workLocations",
  workSchedule: "workSchedules",
  attendanceAssignment: "attendanceAssignments",
  attendanceEvent: "attendanceEvents",
  attendanceSession: "attendanceSessions",
  attendanceBreak: "attendanceBreaks",
  attendanceException: "attendanceExceptions",
  attendanceApproval: "attendanceApprovals",
  attendanceIdempotency: "attendanceIdempotency",
  attendanceLock: "attendanceLocks",
  timesheet: "timesheets",
  overtimeRequest: "overtimeRequests",
  ticketSequence: "ticketSequences",
  ticket: "tickets",
  ticketComment: "ticketComments",
  ticketAttachment: "ticketAttachments",
  ticketHistory: "ticketHistory",
  slaPolicy: "slaPolicies",
  slaEvent: "slaEvents",
  escalation: "escalations",
  escalationExecution: "escalationExecutions",
  automationRule: "automationRules",
  automationExecution: "automationExecutions",
  emailMessage: "emailMessages",
  emailAttachment: "emailAttachments",
  emailRetry: "emailRetries",
  asset: "assets",
  assetType: "assetTypes",
  assetAssignment: "assetAssignments",
  assetEvent: "assetEvents",
  assetSoftware: "assetSoftware",
  softwareCatalog: "softwareCatalog",
  softwareLicence: "softwareLicences",
  licenceAssignment: "licenceAssignments",
  assetMaintenance: "assetMaintenance",
  assetWarranty: "assetWarranties",
  assetFile: "assetFiles",
  assetImport: "assetImports",
  assetTagCounter: "assetTagCounters",
  assetHealthSnapshot: "assetHealthSnapshots",
  networkEnvironment: "networkEnvironments",
  networkDevice: "networkDevices",
  endpoint: "endpoints",
  endpointEnrollment: "endpointEnrollments",
  endpointCredential: "endpointCredentials",
  endpointAudit: "endpointAudits",
  endpointSnapshot: "endpointSnapshots",
  endpointChange: "endpointChanges",
  networkAlert: "networkAlerts",
  networkAlertEvent: "networkAlertEvents",
  monitoringPolicy: "monitoringPolicies",
  auditIngestionLog: "auditIngestionLogs",
  endpointCommand: "endpointCommands",
  endpointCommandResult: "endpointCommandResults",
  endpointRateLimit: "endpointRateLimits",
  endpointNonce: "endpointNonces",
  networkSavedView: "networkSavedViews",
  networkRetentionRun: "networkRetentionRuns",
  workspace: "workspaces",
  client: "clients",
  clientContact: "clientContacts",
  clientSite: "clientSites",
  contract: "contracts",
  supportAgreement: "supportAgreements",
  billingProfile: "billingProfiles",
  clientNote: "clientNotes",
  clientFile: "clientFiles",
  portalInvitation: "portalInvitations",
  portalAccount: "portalAccounts",
  businessHour: "businessHours",
  publicHoliday: "publicHolidays",
  technicianQueue: "technicianQueues",
  project: "projects",
  projectUniqueness: "projectUniqueness",
  projectStatusHistory: "projectStatusHistory",
  projectMember: "projectMembers",
  projectTask: "projectTasks",
  projectTaskUniqueness: "projectTaskUniqueness",
  projectTaskStatusHistory: "projectTaskStatusHistory",
  projectTaskDependency: "projectTaskDependencies",
  projectMilestone: "projectMilestones",
  projectTimeEntry: "projectTimeEntries",
  projectTimerLock: "projectTimerLocks",
  projectComment: "projectComments",
  projectCommentEdit: "projectCommentEdits",
  projectFile: "projectFiles",
  projectRisk: "projectRisks",
  projectActivity: "projectActivities",
  projectHealthSnapshot: "projectHealthSnapshots",
  projectTemplate: "projectTemplates",
  projectTemplateTask: "projectTemplateTasks",
  projectSavedView: "projectSavedViews",
  projectTicketLink: "projectTicketLinks",
  projectAssetLink: "projectAssetLinks",
  projectAutomationExecution: "projectAutomationExecutions",
  financeSetting: "financeSettings",
  clientBillingProfile: "clientBillingProfiles",
  quote: "quotes",
  quoteUniqueness: "quoteUniqueness",
  quoteRevision: "quoteRevisions",
  invoice: "invoices",
  invoiceUniqueness: "invoiceUniqueness",
  recurringInvoiceTemplate: "recurringInvoiceTemplates",
  recurringInvoiceRun: "recurringInvoiceRuns",
  creditNote: "creditNotes",
  creditNoteUniqueness: "creditNoteUniqueness",
  payment: "payments",
  paymentUniqueness: "paymentUniqueness",
  paymentAllocation: "paymentAllocations",
  expense: "expenses",
  expenseUniqueness: "expenseUniqueness",
  supplier: "suppliers",
  supplierUniqueness: "supplierUniqueness",
  purchaseOrder: "purchaseOrders",
  purchaseOrderUniqueness: "purchaseOrderUniqueness",
  purchaseReceipt: "purchaseReceipts",
  budget: "budgets",
  budgetRevision: "budgetRevisions",
  financialApproval: "financialApprovals",
  financialDocument: "financialDocuments",
  financialActivity: "financialActivities",
  financialExport: "financialExports",
  financialNumberCounter: "financialNumberCounters",
} as const;

function convertValue(value: any): any {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(convertValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convertValue(item)]));
  }
  return value;
}

async function raw(model: keyof typeof collections) {
  const snapshot = await firestoreAdmin.collection(collections[model]).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...convertValue(document.data()) }));
}

async function rawDocument(model: keyof typeof collections, id: string) {
  const document = await firestoreAdmin.collection(collections[model]).doc(id).get();
  return document.exists ? { id: document.id, ...convertValue(document.data()) } : null;
}

function simpleWhere(where?: RecordData) {
  if (!where || Object.keys(where).length === 0) return [] as Array<[string, FirebaseFirestore.WhereFilterOp, any]>;
  if (where.AND || where.OR || where.NOT) return null;
  const clauses: Array<[string, FirebaseFirestore.WhereFilterOp, any]> = [];
  for (const [field, condition] of Object.entries(where)) {
    if (condition === undefined) continue;
    if (condition === null || typeof condition !== "object" || condition instanceof Date) {
      clauses.push([field, "==", condition]);
      continue;
    }
    if ("equals" in condition) clauses.push([field, "==", condition.equals]);
    else if ("in" in condition) clauses.push([field, "in", condition.in]);
    else if ("notIn" in condition) clauses.push([field, "not-in", condition.notIn]);
    else if ("arrayContains" in condition) clauses.push([field, "array-contains", condition.arrayContains]);
    else if ("arrayContainsAny" in condition) clauses.push([field, "array-contains-any", condition.arrayContainsAny]);
    else if ("gt" in condition) clauses.push([field, ">", condition.gt]);
    else if ("gte" in condition) clauses.push([field, ">=", condition.gte]);
    else if ("lt" in condition) clauses.push([field, "<", condition.lt]);
    else if ("lte" in condition) clauses.push([field, "<=", condition.lte]);
    else return null;
  }
  return clauses;
}

async function rawMany(model: keyof typeof collections, args: RecordData = {}) {
  const clauses = simpleWhere(args.where);
  if (clauses === null) return null;
  let query: FirebaseFirestore.Query = firestoreAdmin.collection(collections[model]);
  for (const [field, operator, value] of clauses) query = query.where(field, operator, value);
  const orderBy = !args.orderBy ? [] : Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
  for (const rule of orderBy) {
    const [field, direction] = Object.entries(rule)[0] as [string, FirebaseFirestore.OrderByDirection];
    query = query.orderBy(field, direction);
  }
  if (args.skip) query = query.offset(args.skip);
  if (args.cursor?.id) {
    const cursorDocument = await firestoreAdmin.collection(collections[model]).doc(args.cursor.id).get();
    if (cursorDocument.exists) query = query.startAfter(cursorDocument);
  }
  if (args.take != null) query = query.limit(args.take);
  try {
    const snapshot = await query.get();
    return snapshot.docs.map((document) => ({ id: document.id, ...convertValue(document.data()) }));
  } catch (error: any) {
    // Firestore requires composite indexes for some filter/order combinations.
    // Preserve functionality until that optional index is provisioned.
    if (error?.code === 9 || error?.code === "failed-precondition") return null;
    throw error;
  }
}

function scalarMatches(actual: any, condition: any): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    return actual === condition;
  }
  if ("equals" in condition && actual !== condition.equals) return false;
  if ("in" in condition && !condition.in.includes(actual)) return false;
  if ("notIn" in condition && condition.notIn.includes(actual)) return false;
  if ("arrayContains" in condition && !(Array.isArray(actual) && actual.includes(condition.arrayContains))) return false;
  if ("arrayContainsAny" in condition && !(Array.isArray(actual) && condition.arrayContainsAny.some((item: any) => actual.includes(item)))) return false;
  if ("not" in condition && scalarMatches(actual, condition.not)) return false;
  if ("contains" in condition) {
    const left = String(actual ?? "");
    const right = String(condition.contains);
    if (condition.mode === "insensitive" ? !left.toLowerCase().includes(right.toLowerCase()) : !left.includes(right)) return false;
  }
  if ("startsWith" in condition && !String(actual ?? "").startsWith(condition.startsWith)) return false;
  if ("gt" in condition && !(actual > condition.gt)) return false;
  if ("gte" in condition && !(actual >= condition.gte)) return false;
  if ("lt" in condition && !(actual < condition.lt)) return false;
  if ("lte" in condition && !(actual <= condition.lte)) return false;
  return true;
}

function matches(record: RecordData, where?: RecordData): boolean {
  if (!where || Object.keys(where).length === 0) return true;
  if (where.AND) {
    const clauses = Array.isArray(where.AND) ? where.AND : [where.AND];
    if (!clauses.every((clause) => matches(record, clause))) return false;
  }
  if (where.OR) {
    const clauses = Array.isArray(where.OR) ? where.OR : [where.OR];
    if (!clauses.some((clause) => matches(record, clause))) return false;
  }
  if (where.NOT && matches(record, where.NOT)) return false;

  return Object.entries(where).every(([key, condition]) => {
    if (["AND", "OR", "NOT"].includes(key)) return true;
    const actual = record[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("some" in condition) return Array.isArray(actual) && actual.some((item) => matches(item, condition.some));
      if ("none" in condition) return Array.isArray(actual) && !actual.some((item) => matches(item, condition.none));
      if ("is" in condition) return condition.is === null ? actual == null : matches(actual, condition.is);
      if ("arrayContains" in condition) return Array.isArray(actual) && actual.includes(condition.arrayContains);
      if ("arrayContainsAny" in condition) return Array.isArray(actual) && condition.arrayContainsAny.some((item: any) => actual.includes(item));
    }
    return scalarMatches(actual, condition);
  });
}

function sortRecords(records: RecordData[], orderBy: any) {
  const rules = !orderBy ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
  return records.sort((left, right) => {
    for (const rule of rules) {
      const [field, direction] = Object.entries(rule)[0] as [string, any];
      const a = left[field];
      const b = right[field];
      if (a === b) continue;
      const result = a == null ? 1 : b == null ? -1 : a > b ? 1 : -1;
      return direction === "desc" ? -result : result;
    }
    return 0;
  });
}

function project(record: RecordData | null, select?: RecordData) {
  if (!record || !select) return record;
  return Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, record[key]]));
}

async function hydrate(model: keyof typeof collections, record: RecordData, include?: RecordData): Promise<RecordData> {
  if (!include) return record;
  if (model === "user") {
    const links = (await rawMany("userRole", { where: { userId: record.id } })) ?? [];
    record.roles = await Promise.all(links.map(async (link) => {
      const role = await rawDocument("role", link.roleId);
      const roleInclude = include.roles?.include?.role?.include;
      return { ...link, role: role ? await hydrate("role", role, roleInclude) : null };
    }));
  } else if (model === "role") {
    const [userLinks, permissionLinks] = await Promise.all([
      rawMany("userRole", { where: { roleId: record.id } }),
      rawMany("rolePermission", { where: { roleId: record.id } }),
    ]);
    record.users = userLinks;
    record.permissions = await Promise.all((permissionLinks ?? []).map(async (link) => ({
      ...link,
      permission: include.permissions?.include?.permission ? await rawDocument("permission", link.permissionId) : undefined,
    })));
    record._count = { users: userLinks?.length ?? 0 };
  } else if (model === "session") {
    record.user = await rawDocument("user", record.userId);
    if (record.user) record.user = await hydrate("user", record.user, include.user?.include);
  } else if (model === "auditLog" || model === "notification") {
    record.user = await rawDocument("user", record.userId);
  } else if (model === "ticket") {
    const [users, categories, comments, attachments, history] = await Promise.all([
      raw("user"), raw("ticketCategory"), raw("ticketComment"), raw("ticketAttachment"), raw("ticketHistory"),
    ]);
    record.requester = users.find((item) => item.id === record.requesterId) ?? null;
    record.assignee = users.find((item) => item.id === record.assigneeId) ?? null;
    record.createdBy = users.find((item) => item.id === record.createdById) ?? null;
    record.updatedBy = users.find((item) => item.id === record.updatedById) ?? null;
    record.category = categories.find((item) => item.id === record.categoryId) ?? null;
    const [clients, agreements, policies, assets, endpoints, networkAlerts] = await Promise.all([
      raw("client"),
      raw("supportAgreement"),
      raw("slaPolicy"),
      raw("asset"),
      raw("endpoint"),
      raw("networkAlert"),
    ]);
    record.client = clients.find((item) => item.id === record.clientId) ?? null;
    record.site = (await raw("clientSite")).find((item) => item.id === record.siteId) ?? null;
    record.supportAgreement = agreements.find((item) => item.id === record.supportAgreementId) ?? null;
    record.slaPolicy = policies.find((item) => item.id === record.slaPolicyId) ?? null;
    record.asset = assets.find((item) => item.id === record.assetId) ?? null;
    record.endpoint = endpoints.find((item) => item.id === record.endpointId) ?? null;
    record.networkAlert = networkAlerts.find((item) => item.id === record.networkAlertId) ?? null;
    record.comments = comments.filter((item) => item.ticketId === record.id).map((item) => ({
      ...item,
      author: users.find((user) => user.id === item.authorId) ?? null,
      attachments: attachments.filter((attachment) => attachment.commentId === item.id),
    }));
    record.attachments = attachments.filter((item) => item.ticketId === record.id);
    record.history = history.filter((item) => item.ticketId === record.id).map((item) => ({
      ...item,
      actor: users.find((user) => user.id === item.actorId) ?? null,
    }));
  } else if (model === "client") {
    record.contacts = (await rawMany("clientContact", { where: { clientId: record.id } })) ?? [];
    record.sites = (await rawMany("clientSite", { where: { clientId: record.id } })) ?? [];
    record.contracts = (await rawMany("contract", { where: { clientId: record.id } })) ?? [];
    record.supportAgreements = (await rawMany("supportAgreement", { where: { clientId: record.id } })) ?? [];
    record.billingProfiles = (await rawMany("billingProfile", { where: { clientId: record.id } })) ?? [];
    record.notes = (await rawMany("clientNote", { where: { clientId: record.id } })) ?? [];
    record.files = (await rawMany("clientFile", { where: { clientId: record.id } })) ?? [];
    record.portalInvitations = (await rawMany("portalInvitation", { where: { clientId: record.id } })) ?? [];
  } else if (model === "slaPolicy") {
    record.events = (await rawMany("slaEvent", { where: { slaPolicyId: record.id } })) ?? [];
  } else if (model === "asset") {
    const [assetTypes, clients, sites, users, tickets, assignments, maintenance, warranties, files, events, software, licences, healthSnapshots] = await Promise.all([
      raw("assetType"),
      raw("client"),
      raw("clientSite"),
      raw("user"),
      raw("ticket"),
      rawMany("assetAssignment", { where: { assetId: record.id }, orderBy: [{ assignedAt: "desc" }] }),
      rawMany("assetMaintenance", { where: { assetId: record.id }, orderBy: [{ startDate: "desc" }] }),
      rawMany("assetWarranty", { where: { assetId: record.id }, orderBy: [{ expiryDate: "desc" }] }),
      rawMany("assetFile", { where: { assetId: record.id }, orderBy: [{ createdAt: "desc" }] }),
      rawMany("assetEvent", { where: { assetId: record.id }, orderBy: [{ createdAt: "desc" }] }),
      rawMany("assetSoftware", { where: { assetId: record.id }, orderBy: [{ lastDetectedAt: "desc" }] }),
      rawMany("softwareLicence", { where: { assetId: record.id } }),
      rawMany("assetHealthSnapshot", { where: { assetId: record.id }, orderBy: [{ calculatedAt: "desc" }] }),
    ]);
    record.assetType = assetTypes.find((item) => item.id === record.assetTypeId) ?? null;
    record.client = clients.find((item) => item.id === record.clientId) ?? null;
    record.site = sites.find((item) => item.id === record.siteId) ?? null;
    record.assignedUser = users.find((item) => item.id === record.assignedUserId) ?? null;
    record.responsibleTechnician = users.find((item) => item.id === record.responsibleTechnicianId) ?? null;
    record.tickets = tickets.filter((ticket) => ticket.assetId === record.id);
    record.assignments = assignments ?? [];
    record.maintenance = maintenance ?? [];
    record.assetWarranties = warranties ?? [];
    record.files = files ?? [];
    record.events = events ?? [];
    record.software = software ?? [];
    record.licences = licences ?? [];
    record.healthSnapshots = healthSnapshots ?? [];
  }
  return record;
}

function cleanData(data: RecordData) {
  const result: RecordData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value && typeof value === "object" && "connect" in value) {
      result[`${key}Id`] = value.connect.id;
    } else if (value && typeof value === "object" && ("create" in value || "createMany" in value)) {
      continue;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function repository(model: keyof typeof collections) {
  const collection = firestoreAdmin.collection(collections[model]);
  return {
    async findMany(args: RecordData = {}) {
      const queried = await rawMany(model, args);
      let records = queried ?? await raw(model);
      if (queried === null) {
        records = records.filter((record) => matches(record, args.where));
        sortRecords(records, args.orderBy);
        if (args.cursor?.id) {
          const cursorIndex = records.findIndex((record) => record.id === args.cursor.id);
          if (cursorIndex >= 0) records = records.slice(cursorIndex + 1);
        }
        if (args.skip) records = records.slice(args.skip);
        if (args.take != null) records = records.slice(0, args.take);
      }
      records = await Promise.all(records.map((record) => hydrate(model, record, args.include)));
      return records.map((record) => project(record, args.select));
    },
    async findUnique(args: RecordData) {
      let record: RecordData | null = null;
      if (typeof args.where?.id === "string") record = await rawDocument(model, args.where.id);
      else {
        const records = await rawMany(model, { where: args.where, take: 1 });
        if (records) record = records[0] ?? null;
        else record = (await raw(model)).find((item) => matches(item, args.where)) ?? null;
      }
      if (record) record = await hydrate(model, record, args.include);
      return project(record, args.select);
    },
    async findFirst(args: RecordData = {}) {
      const records = await this.findMany({ ...args, take: 1 });
      return records[0] ?? null;
    },
    async count(args: RecordData = {}) {
      const clauses = simpleWhere(args.where);
      if (clauses !== null) {
        let query: FirebaseFirestore.Query = collection;
        for (const [field, operator, value] of clauses) query = query.where(field, operator, value);
        try {
          return (await query.count().get()).data().count;
        } catch (error: any) {
          // Keep dashboards usable while a newly declared composite index is building.
          if (error?.code !== 9 && error?.code !== "failed-precondition") throw error;
        }
      }
      return (await this.findMany({ where: args.where })).length;
    },
    async create(args: RecordData) {
      const reference = args.data.id ? collection.doc(args.data.id) : collection.doc();
      const now = new Date();
      const data: RecordData = { ...cleanData(args.data), createdAt: args.data.createdAt ?? now, updatedAt: args.data.updatedAt ?? now };
      delete data.id;
      await reference.set(data);
      const created = { id: reference.id, ...data };
      await createNested(model, created.id, args.data);
      return hydrate(model, created, args.include);
    },
    async createMany(args: RecordData) {
      const items = args.data ?? [];
      await Promise.all(items.map((data: RecordData) => this.create({ data })));
      return { count: items.length };
    },
    async update(args: RecordData) {
      const existing = await this.findUnique({ where: args.where });
      if (!existing) throw new Error(`${model} not found`);
      const data = { ...cleanData(args.data), updatedAt: new Date() };
      await collection.doc(existing.id).update(data);
      await updateNested(model, existing.id, args.data);
      return hydrate(model, { ...existing, ...data }, args.include);
    },
    async updateMany(args: RecordData) {
      const records = (await this.findMany({ where: args.where })).filter((record: RecordData | null): record is RecordData => Boolean(record));
      await Promise.all(records.map((record: RecordData) => collection.doc(record.id).update({ ...cleanData(args.data), updatedAt: new Date() })));
      return { count: records.length };
    },
    async delete(args: RecordData) {
      const existing = await this.findUnique({ where: args.where });
      if (!existing) throw new Error(`${model} not found`);
      await collection.doc(existing.id).delete();
      return existing;
    },
    async deleteMany(args: RecordData = {}) {
      const records = (await this.findMany({ where: args.where })).filter((record: RecordData | null): record is RecordData => Boolean(record));
      await Promise.all(records.map((record: RecordData) => collection.doc(record.id).delete()));
      return { count: records.length };
    },
    async upsert(args: RecordData) {
      const existing = await this.findUnique({ where: args.where });
      return existing ? this.update({ where: { id: existing.id }, data: args.update }) : this.create({ data: args.create });
    },
  };
}

async function createNested(model: keyof typeof collections, id: string, data: RecordData) {
  if (model === "user" && data.roles?.create) {
    const items = Array.isArray(data.roles.create) ? data.roles.create : [data.roles.create];
    await Promise.all(items.map((item: any) => db.userRole.create({ data: { userId: id, roleId: item.roleId ?? item.role?.connect?.id } })));
  }
  if (model === "role" && data.permissions?.create) {
    const items = Array.isArray(data.permissions.create) ? data.permissions.create : [data.permissions.create];
    await Promise.all(items.map((item: any) => db.rolePermission.create({ data: { roleId: id, permissionId: item.permissionId ?? item.permission?.connect?.id } })));
  }
}

async function updateNested(model: keyof typeof collections, id: string, data: RecordData) {
  if (model === "user" && data.roles?.set) {
    await db.userRole.deleteMany({ where: { userId: id } });
    await db.userRole.createMany({ data: data.roles.set.map((role: any) => ({ userId: id, roleId: role.id })) });
  }
}

export const db: any = Object.fromEntries(
  Object.keys(collections).map((model) => [model, repository(model as keyof typeof collections)]),
);

db.$transaction = async (operation: any) =>
  typeof operation === "function" ? operation(db) : Promise.all(operation);
db.$disconnect = async () => undefined;
db.fieldValue = FieldValue;

// Temporary alias while feature modules migrate from the old client name.
export const prisma = db;
