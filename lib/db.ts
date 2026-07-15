import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

type RecordData = Record<string, any>;

const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? join(process.cwd(), "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

const adminApp =
  getApps()[0] ??
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

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
  ticketSequence: "ticketSequences",
  ticket: "tickets",
  ticketComment: "ticketComments",
  ticketAttachment: "ticketAttachments",
  ticketHistory: "ticketHistory",
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

function scalarMatches(actual: any, condition: any): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    return actual === condition;
  }
  if ("equals" in condition && actual !== condition.equals) return false;
  if ("in" in condition && !condition.in.includes(actual)) return false;
  if ("notIn" in condition && condition.notIn.includes(actual)) return false;
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

async function hydrate(model: keyof typeof collections, record: RecordData): Promise<RecordData> {
  if (model === "user") {
    const links = (await raw("userRole")).filter((item) => item.userId === record.id);
    const roles = await raw("role");
    record.roles = await Promise.all(links.map(async (link) => {
      const role = roles.find((item) => item.id === link.roleId);
      return { ...link, role: role ? await hydrate("role", role) : null };
    }));
  } else if (model === "role") {
    const userLinks = (await raw("userRole")).filter((item) => item.roleId === record.id);
    const permissionLinks = (await raw("rolePermission")).filter((item) => item.roleId === record.id);
    const permissions = await raw("permission");
    record.users = userLinks;
    record.permissions = permissionLinks.map((link) => ({ ...link, permission: permissions.find((item) => item.id === link.permissionId) }));
    record._count = { users: userLinks.length };
  } else if (model === "session") {
    record.user = (await raw("user")).find((item) => item.id === record.userId) ?? null;
    if (record.user) record.user = await hydrate("user", record.user);
  } else if (model === "auditLog" || model === "notification") {
    record.user = (await raw("user")).find((item) => item.id === record.userId) ?? null;
  } else if (model === "ticket") {
    const [users, categories, comments, attachments, history] = await Promise.all([
      raw("user"), raw("ticketCategory"), raw("ticketComment"), raw("ticketAttachment"), raw("ticketHistory"),
    ]);
    record.requester = users.find((item) => item.id === record.requesterId) ?? null;
    record.assignee = users.find((item) => item.id === record.assigneeId) ?? null;
    record.createdBy = users.find((item) => item.id === record.createdById) ?? null;
    record.updatedBy = users.find((item) => item.id === record.updatedById) ?? null;
    record.category = categories.find((item) => item.id === record.categoryId) ?? null;
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
      let records = await Promise.all((await raw(model)).map((record) => hydrate(model, record)));
      records = records.filter((record) => matches(record, args.where));
      sortRecords(records, args.orderBy);
      if (args.skip) records = records.slice(args.skip);
      if (args.take != null) records = records.slice(0, args.take);
      return records.map((record) => project(record, args.select));
    },
    async findUnique(args: RecordData) {
      const records = (await this.findMany({ where: args.where })).filter((record: RecordData | null): record is RecordData => Boolean(record));
      return project(records[0] ?? null, args.select);
    },
    async findFirst(args: RecordData = {}) {
      const records = await this.findMany({ ...args, take: 1 });
      return records[0] ?? null;
    },
    async count(args: RecordData = {}) {
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
      return hydrate(model, created);
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
      return hydrate(model, { ...existing, ...data });
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
