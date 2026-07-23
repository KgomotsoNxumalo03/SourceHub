import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { env } from "@/lib/env";
import { recordEnterpriseAudit } from "@/lib/enterprise";
import { calculateHealthStatus, defectSchema, feedbackSchema, incidentSchema, operationalEventNames, releaseSchema, safeAnalyticsMetadata, sanitizeOperationalText, type OperationalEventName } from "@/lib/operations-core";
import type { CurrentUser } from "@/lib/permissions";

const workspaceId = env.DEFAULT_WORKSPACE_ID;
const dateValue = (value: unknown) => value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate() : value;
const plain = (data: FirebaseFirestore.DocumentData) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, dateValue(value)]));

async function records(collection: string, limit = 100): Promise<Array<Record<string, any>>> {
  const snapshot = await firestoreAdmin.collection(collection).where("workspaceId", "==", workspaceId).limit(limit).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...plain(document.data()) }));
}

export async function getOperationalSummary() {
  const [health, incidents, defects, feedback, releases] = await Promise.all([
    records(collectionNames.operationalHealthChecks, 100), records(collectionNames.operationalIncidents, 100),
    records(collectionNames.operationalDefects, 100), records(collectionNames.operationalFeedback, 100),
    records(collectionNames.operationalReleases, 50),
  ]);
  const latestHealth = new Map<string, Record<string, any>>();
  for (const item of health.sort((a, b) => new Date(String(a.checkedAt ?? 0)).getTime() - new Date(String(b.checkedAt ?? 0)).getTime())) latestHealth.set(String(item.dependency), item);
  const healthRows: Array<Record<string, any>> = Array.from(latestHealth.values()).map((item) => ({ ...item, derivedStatus: calculateHealthStatus({ lastSuccessAt: item.lastSuccessAt ? new Date(String(item.lastSuccessAt)) : null, failureCount: Number(item.failureCount ?? 0), staleAfterMinutes: env.OPERATIONS_HEALTH_STALE_MINUTES }) }));
  return {
    health: healthRows,
    incidents: incidents.filter((item) => !["RESOLVED", "CLOSED"].includes(String(item.status))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20),
    defects: defects.filter((item) => !["RESOLVED", "CLOSED"].includes(String(item.status))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20),
    feedback: feedback.sort((a, b) => Number(b.voteCount ?? 0) - Number(a.voteCount ?? 0)).slice(0, 20),
    releases: releases.filter((item) => ["BLOCKED", "IN_PROGRESS"].includes(String(item.status))),
  };
}

export async function submitFeedback(input: unknown, actor: CurrentUser) {
  const value = feedbackSchema.parse(input);
  const id = randomUUID();
  await firestoreAdmin.collection(collectionNames.operationalFeedback).doc(id).set({ id, workspaceId, tenantId: workspaceId, userId: actor.id, category: value.category, module: sanitizeOperationalText(value.module, 80), description: sanitizeOperationalText(value.description), impact: value.impact, frequency: value.frequency, visibility: value.visibility, status: "NEW", voteCount: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId, action: "operations.feedback.submitted", targetType: "OperationalFeedback", targetId: id, metadata: { category: value.category, module: value.module, impact: value.impact } });
  return id;
}

export async function recordProductEvent(eventName: OperationalEventName, actor: Pick<CurrentUser, "id"> | null, metadata?: unknown) {
  if (!env.OPERATIONS_ENABLED || !operationalEventNames.includes(eventName)) return null;
  const id = randomUUID();
  await firestoreAdmin.collection(collectionNames.operationalAnalyticsEvents).doc(id).set({ id, workspaceId, eventName, userId: actor?.id ?? null, metadata: safeAnalyticsMetadata(metadata), createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + env.OPERATIONS_ANALYTICS_RETENTION_DAYS * 86_400_000) });
  return id;
}

export async function recordHealthCheck(input: { dependency: string; status: string; latencyMs?: number; failureCount?: number; owner?: string; runbookPath?: string; correlationId?: string }) {
  const id = randomUUID();
  await firestoreAdmin.collection(collectionNames.operationalHealthChecks).doc(id).set({ id, workspaceId, dependency: sanitizeOperationalText(input.dependency, 80), status: sanitizeOperationalText(input.status, 30), latencyMs: Math.max(0, Math.min(120000, Number(input.latencyMs ?? 0))), failureCount: Math.max(0, Math.min(100, Number(input.failureCount ?? 0))), owner: sanitizeOperationalText(input.owner, 120), runbookPath: sanitizeOperationalText(input.runbookPath, 240), correlationId: sanitizeOperationalText(input.correlationId, 120), checkedAt: FieldValue.serverTimestamp(), lastSuccessAt: input.status === "HEALTHY" ? FieldValue.serverTimestamp() : null });
  return id;
}

async function createRecord(collection: string, schema: typeof incidentSchema | typeof defectSchema | typeof releaseSchema, input: unknown, actor: CurrentUser, type: string) {
  const value = schema.parse(input) as Record<string, any>;
  const id = randomUUID();
  const safeValue = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, Array.isArray(child) ? child.map((item) => sanitizeOperationalText(item, 80)) : sanitizeOperationalText(child, 5000)]));
  await firestoreAdmin.collection(collection).doc(id).set({ id, workspaceId, tenantId: workspaceId, ...safeValue, status: type === "release" ? "PLANNED" : "OPEN", createdBy: actor.id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await recordEnterpriseAudit({ actorId: actor.id, workspaceId, action: `operations.${type}.created`, targetType: `Operational${type[0].toUpperCase()}${type.slice(1)}`, targetId: id, metadata: { title: safeValue.title, version: safeValue.version, severity: safeValue.severity, priority: safeValue.priority } });
  return id;
}

export const createIncident = (input: unknown, actor: CurrentUser) => createRecord(collectionNames.operationalIncidents, incidentSchema, input, actor, "incident");
export const createDefect = (input: unknown, actor: CurrentUser) => createRecord(collectionNames.operationalDefects, defectSchema, input, actor, "defect");
export const createRelease = (input: unknown, actor: CurrentUser) => createRecord(collectionNames.operationalReleases, releaseSchema, input, actor, "release");
