import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { firestoreAdmin } from "@/lib/db";
import { env } from "@/lib/env";
import {
  MAX_AUDIT_BYTES,
  MIN_AUDIT_SCRIPT_VERSION,
  SIGNATURE_CLOCK_SKEW_SECONDS,
  alertDeduplicationKey,
  buildAlertConditions,
  calculateEndpointPosture,
  defaultMonitoringPolicy,
  detectEndpointChanges,
  endpointAuditSchema,
  matchAssetCandidates,
  networkSearchTokens,
  resolveMonitoringPolicy,
  semverAtLeast,
  type EndpointAudit,
  type MonitoringPolicyLike,
} from "@/lib/network";
import {
  createSecureToken,
  hashRestrictedCredential,
  isRequestTimestampFresh,
  secureStringEqual,
  sha256,
  verifyRequestSignature,
} from "@/lib/network-security";

type EnrolmentExchangeInput = {
  token: string;
  computerName: string;
  deviceIdentifier?: string | null;
  ipAddress?: string | null;
};

type IngestionHeaders = {
  endpointId: string;
  credential: string;
  timestamp: string;
  nonce: string;
  signature: string;
  idempotencyKey: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export class NetworkIngestionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

function safeDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  const parsed = value ? new Date(String(value)) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function logIngestion(input: {
  endpointId?: string | null;
  workspaceId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  status: "SUCCESS" | "REJECTED" | "DUPLICATE";
  reasonCode?: string | null;
  auditId?: string | null;
  idempotencyKey?: string | null;
  sizeBytes: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await firestoreAdmin.collection("auditIngestionLogs").add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function exchangeEndpointEnrolment(input: EnrolmentExchangeInput) {
  if (input.ipAddress) await enforceRateLimit(`enrolment:${sha256(input.ipAddress).slice(0, 24)}`);
  const tokenHash = hashRestrictedCredential(input.token, env.ENDPOINT_CREDENTIAL_PEPPER);
  const enrollmentQuery = await firestoreAdmin.collection("endpointEnrollments").where("tokenHash", "==", tokenHash).limit(1).get();
  const enrollmentDocument = enrollmentQuery.docs[0];
  if (!enrollmentDocument) throw new NetworkIngestionError("The enrolment token is invalid.", 401, "INVALID_ENROLMENT_TOKEN");

  const endpointId = randomUUID();
  const credentialId = randomUUID();
  const credentialSecret = createSecureToken(48);
  const credentialHash = hashRestrictedCredential(credentialSecret, env.ENDPOINT_CREDENTIAL_PEPPER);

  const result = await firestoreAdmin.runTransaction(async (transaction) => {
    const currentDocument = await transaction.get(enrollmentDocument.ref);
    const enrollment = currentDocument.data();
    const expiresAt = safeDate(enrollment?.expiresAt);
    if (!enrollment || enrollment.revokedAt || !expiresAt || expiresAt <= new Date()) {
      throw new NetworkIngestionError("The enrolment token has expired or was revoked.", 401, "ENROLMENT_EXPIRED");
    }
    if ((enrollment.useCount ?? 0) >= (enrollment.maxUses ?? 1)) {
      throw new NetworkIngestionError("The enrolment token has reached its use limit.", 401, "ENROLMENT_USE_LIMIT");
    }

    const endpointRef = firestoreAdmin.collection("endpoints").doc(endpointId);
    const credentialRef = firestoreAdmin.collection("endpointCredentials").doc(credentialId);
    const now = FieldValue.serverTimestamp();
    transaction.create(endpointRef, {
      workspaceId: enrollment.workspaceId,
      clientId: enrollment.clientId,
      siteId: enrollment.siteId,
      assetId: enrollment.assetId ?? null,
      networkEnvironmentId: enrollment.networkEnvironmentId ?? null,
      endpointIdentityId: endpointId,
      computerName: input.computerName,
      deviceIdentifier: input.deviceIdentifier ?? null,
      responsibleTechnicianId: enrollment.createdById ?? null,
      monitoringState: "ACTIVE",
      healthState: "UNKNOWN",
      complianceState: "UNKNOWN",
      checkInState: "ENROLLED",
      matchState: enrollment.assetId ? "MANUALLY_LINKED" : "PENDING",
      activeCredentialId: credentialId,
      activeAlertCount: 0,
      searchTokens: networkSearchTokens([input.computerName, input.deviceIdentifier]),
      lastCheckIn: null,
      lastSuccessfulCheck: null,
      revokedAt: null,
      createdById: enrollment.createdById ?? null,
      updatedById: enrollment.createdById ?? null,
      createdAt: now,
      updatedAt: now,
    });
    transaction.create(credentialRef, {
      endpointId,
      workspaceId: enrollment.workspaceId,
      clientId: enrollment.clientId,
      siteId: enrollment.siteId,
      credentialHash,
      status: "ACTIVE",
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    transaction.update(currentDocument.ref, {
      useCount: FieldValue.increment(1),
      lastUsedAt: now,
      updatedAt: now,
    });
    return {
      endpointId,
      workspaceId: enrollment.workspaceId as string,
      clientId: enrollment.clientId as string,
      siteId: enrollment.siteId as string,
    };
  });

  await firestoreAdmin.collection("auditLogs").add({
    userId: null,
    action: "endpoints.enrol.exchange",
    entityType: "Endpoint",
    entityId: endpointId,
    metadata: { workspaceId: result.workspaceId, clientId: result.clientId, siteId: result.siteId },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    endpointId,
    credentialId,
    credential: credentialSecret,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    schemaVersion: "1.0",
  };
}

async function enforceRateLimit(endpointId: string) {
  const minute = Math.floor(Date.now() / 60_000);
  const reference = firestoreAdmin.collection("endpointRateLimits").doc(`${endpointId}-${minute}`);
  await firestoreAdmin.runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    const count = document.data()?.count ?? 0;
    if (count >= env.ENDPOINT_RATE_LIMIT_PER_MINUTE) throw new NetworkIngestionError("Too many submissions.", 429, "RATE_LIMITED");
    transaction.set(reference, {
      endpointId,
      minute,
      count: count + 1,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60_000)),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function authenticateSubmission(body: string, headers: IngestionHeaders) {
  if (!headers.endpointId || !headers.credential || !headers.timestamp || !headers.nonce || !headers.signature || !headers.idempotencyKey) {
    throw new NetworkIngestionError("Required authentication headers are missing.", 401, "MISSING_AUTH_HEADERS");
  }
  if (!isRequestTimestampFresh(headers.timestamp, SIGNATURE_CLOCK_SKEW_SECONDS)) {
    throw new NetworkIngestionError("The request timestamp is outside the allowed window.", 401, "STALE_TIMESTAMP");
  }
  await enforceRateLimit(`${headers.endpointId}:${headers.ipAddress ? sha256(headers.ipAddress).slice(0, 24) : "unknown"}`);
  const endpointDocument = await firestoreAdmin.collection("endpoints").doc(headers.endpointId).get();
  const endpoint = endpointDocument.data();
  if (!endpoint || endpoint.revokedAt || endpoint.monitoringState === "ARCHIVED") {
    throw new NetworkIngestionError("The endpoint is not active.", 401, "ENDPOINT_INACTIVE");
  }
  const credentialDocument = await firestoreAdmin.collection("endpointCredentials").doc(endpoint.activeCredentialId).get();
  const credential = credentialDocument.data();
  const expiresAt = safeDate(credential?.expiresAt);
  if (!credential || credential.endpointId !== headers.endpointId || credential.status !== "ACTIVE" || credential.revokedAt || !expiresAt || expiresAt <= new Date()) {
    throw new NetworkIngestionError("The endpoint credential is invalid.", 401, "INVALID_CREDENTIAL");
  }
  const submittedHash = hashRestrictedCredential(headers.credential, env.ENDPOINT_CREDENTIAL_PEPPER);
  if (!secureStringEqual(submittedHash, credential.credentialHash)) {
    throw new NetworkIngestionError("The endpoint credential is invalid.", 401, "INVALID_CREDENTIAL");
  }
  if (!verifyRequestSignature(headers.credential, headers.timestamp, headers.nonce, body, headers.signature)) {
    throw new NetworkIngestionError("The request signature is invalid.", 401, "INVALID_SIGNATURE");
  }

  const nonceId = sha256(`${headers.endpointId}:${headers.nonce}`);
  const nonceRef = firestoreAdmin.collection("endpointNonces").doc(nonceId);
  await firestoreAdmin.runTransaction(async (transaction) => {
    const nonce = await transaction.get(nonceRef);
    if (nonce.exists) throw new NetworkIngestionError("The request has already been submitted.", 409, "REPLAY_DETECTED");
    transaction.create(nonceRef, {
      endpointId: headers.endpointId,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { endpointDocument, endpoint, credentialDocument };
}

async function loadPolicy(endpoint: Record<string, any>): Promise<MonitoringPolicyLike & { id: string }> {
  const snapshot = await firestoreAdmin.collection("monitoringPolicies").where("workspaceId", "==", endpoint.workspaceId).where("active", "==", true).get();
  const policies = snapshot.docs.map((document) => ({ id: document.id, ...document.data() })) as Array<any>;
  return (resolveMonitoringPolicy(policies, endpoint) as MonitoringPolicyLike & { id: string } | null) ?? { ...defaultMonitoringPolicy, id: "workspace-default" };
}

async function createAutomaticTicket(alert: Record<string, any>, endpoint: Record<string, any>, audit: EndpointAudit) {
  if (alert.relatedTicketId) return alert.relatedTicketId;
  return firestoreAdmin.runTransaction(async (transaction) => {
    const alertRef = firestoreAdmin.collection("networkAlerts").doc(alert.id);
    const currentAlert = await transaction.get(alertRef);
    if (currentAlert.data()?.relatedTicketId) return currentAlert.data()?.relatedTicketId as string;
    const sequenceRef = firestoreAdmin.collection("ticketSequences").doc("default");
    const sequenceDocument = await transaction.get(sequenceRef);
    const currentValue = (sequenceDocument.data()?.currentValue ?? 0) + 1;
    transaction.set(sequenceRef, { name: "default", currentValue, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const ticketRef = firestoreAdmin.collection("tickets").doc();
    const referenceNumber = `SH-TKT-${String(currentValue).padStart(6, "0")}`;
    const priority = alert.severity === "CRITICAL" ? "URGENT" : alert.severity === "HIGH" ? "HIGH" : "NORMAL";
    transaction.create(ticketRef, {
      workspaceId: endpoint.workspaceId,
      referenceNumber,
      subject: `[Network] ${alert.type.replace(/_/g, " ")} - ${endpoint.computerName}`,
      description: `${alert.description}\n\nEndpoint: ${endpoint.computerName}\nAudit: ${audit.auditId}\nSource: SourceHub Network Management`,
      status: "NEW",
      priority,
      categoryId: null,
      clientId: endpoint.clientId,
      siteId: endpoint.siteId,
      assetId: endpoint.assetId ?? null,
      endpointId: endpoint.id,
      networkAlertId: alert.id,
      requesterId: endpoint.createdById,
      assigneeId: endpoint.responsibleTechnicianId ?? null,
      openedAt: FieldValue.serverTimestamp(),
      createdById: endpoint.createdById,
      updatedById: endpoint.createdById,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(alertRef, { relatedTicketId: ticketRef.id, updatedAt: FieldValue.serverTimestamp() });
    return ticketRef.id;
  });
}

async function upsertAlert(condition: { type: string; severity: string; description: string }, endpoint: Record<string, any>, audit: EndpointAudit, policy: MonitoringPolicyLike) {
  const id = alertDeduplicationKey(endpoint.id, condition.type);
  const reference = firestoreAdmin.collection("networkAlerts").doc(id);
  const alert = await firestoreAdmin.runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    const current = document.data();
    const active = current && !["RESOLVED", "CLOSED"].includes(current.status);
    const data = {
      workspaceId: endpoint.workspaceId,
      clientId: endpoint.clientId,
      siteId: endpoint.siteId,
      assetId: endpoint.assetId ?? null,
      endpointId: endpoint.id,
      networkEnvironmentId: endpoint.networkEnvironmentId ?? null,
      type: condition.type,
      severity: condition.severity,
      status: active ? current.status : "NEW",
      description: condition.description,
      detectedAt: active ? current.detectedAt : FieldValue.serverTimestamp(),
      lastDetectedAt: FieldValue.serverTimestamp(),
      occurrenceCount: active ? FieldValue.increment(1) : 1,
      assignedTechnicianId: endpoint.responsibleTechnicianId ?? null,
      acknowledgedById: active ? current.acknowledgedById ?? null : null,
      acknowledgedAt: active ? current.acknowledgedAt ?? null : null,
      resolvedById: null,
      resolvedAt: null,
      relatedTicketId: active ? current.relatedTicketId ?? null : null,
      suppressionState: false,
      suppressionReason: null,
      sourceAuditId: audit.auditId,
      createdAt: active ? current.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(reference, data, { merge: true });
    return { id, ...current, ...data, occurrenceCount: active ? (current.occurrenceCount ?? 0) + 1 : 1 };
  });
  await firestoreAdmin.collection("networkAlertEvents").add({
    alertId: id,
    endpointId: endpoint.id,
    workspaceId: endpoint.workspaceId,
    action: "DETECTED",
    auditId: audit.auditId,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (policy.automaticTicketAlertTypes?.includes(condition.type)) await createAutomaticTicket(alert, endpoint, audit);
  return alert;
}

export async function ingestEndpointAudit(body: string, headers: IngestionHeaders) {
  const sizeBytes = Buffer.byteLength(body, "utf8");
  if (sizeBytes > MAX_AUDIT_BYTES) {
    await logIngestion({ endpointId: headers.endpointId, status: "REJECTED", reasonCode: "PAYLOAD_TOO_LARGE", sizeBytes, ipAddress: headers.ipAddress, userAgent: headers.userAgent });
    throw new NetworkIngestionError("The audit payload is too large.", 413, "PAYLOAD_TOO_LARGE");
  }

  let authenticated: Awaited<ReturnType<typeof authenticateSubmission>>;
  try {
    authenticated = await authenticateSubmission(body, headers);
  } catch (error) {
    const ingestionError = error instanceof NetworkIngestionError ? error : new NetworkIngestionError("Authentication failed.", 401, "AUTHENTICATION_FAILED");
    await logIngestion({ endpointId: headers.endpointId, status: "REJECTED", reasonCode: ingestionError.code, sizeBytes, ipAddress: headers.ipAddress, userAgent: headers.userAgent });
    throw ingestionError;
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    throw new NetworkIngestionError("The audit payload is not valid JSON.", 400, "INVALID_JSON");
  }
  const parsed = endpointAuditSchema.safeParse(parsedBody);
  if (!parsed.success) throw new NetworkIngestionError("The audit payload does not match the supported schema.", 400, "INVALID_SCHEMA");
  const audit = parsed.data;
  if (!semverAtLeast(audit.scriptVersion, MIN_AUDIT_SCRIPT_VERSION)) throw new NetworkIngestionError("The audit script version is no longer supported.", 400, "UNSUPPORTED_SCRIPT_VERSION");
  if (headers.idempotencyKey !== audit.auditId) throw new NetworkIngestionError("The idempotency key must match the audit ID.", 400, "INVALID_IDEMPOTENCY_KEY");

  const existingAudit = await firestoreAdmin.collection("endpointAudits").doc(audit.auditId).get();
  if (existingAudit.exists) {
    await logIngestion({ endpointId: headers.endpointId, workspaceId: authenticated.endpoint.workspaceId, clientId: authenticated.endpoint.clientId, siteId: authenticated.endpoint.siteId, status: "DUPLICATE", auditId: audit.auditId, idempotencyKey: headers.idempotencyKey, sizeBytes, ipAddress: headers.ipAddress, userAgent: headers.userAgent });
    return { accepted: true, duplicate: true, auditId: audit.auditId, endpointId: headers.endpointId };
  }

  const endpoint: Record<string, any> = { id: authenticated.endpointDocument.id, ...authenticated.endpoint };
  const policy = await loadPolicy(endpoint);
  const previousSnapshotDocument = await firestoreAdmin.collection("endpointSnapshots").doc(endpoint.id).get();
  const previousAudit = (previousSnapshotDocument.data()?.audit as EndpointAudit | undefined) ?? null;
  const changes = detectEndpointChanges(previousAudit, audit);
  const posture = calculateEndpointPosture(audit, policy);
  const conditions = buildAlertConditions(audit, policy);

  let assetId = endpoint.assetId ?? null;
  let matchState = endpoint.matchState ?? "PENDING";
  let matchCandidates: unknown[] = [];
  if (!assetId) {
    const assetSnapshot = await firestoreAdmin.collection("assets").where("workspaceId", "==", endpoint.workspaceId).where("clientId", "==", endpoint.clientId).get();
    const match = matchAssetCandidates(audit, assetSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })) as any, endpoint as any);
    assetId = match.assetId;
    matchState = match.status;
    matchCandidates = [...match.candidates];
  }

  const auditReference = firestoreAdmin.collection("endpointAudits").doc(audit.auditId);
  const snapshotReference = firestoreAdmin.collection("endpointSnapshots").doc(endpoint.id);
  const batch = firestoreAdmin.batch();
  batch.create(auditReference, {
    endpointId: endpoint.id,
    workspaceId: endpoint.workspaceId,
    clientId: endpoint.clientId,
    siteId: endpoint.siteId,
    assetId,
    schemaVersion: audit.schemaVersion,
    scriptVersion: audit.scriptVersion,
    auditTimestamp: Timestamp.fromDate(new Date(audit.timestamp)),
    payloadHash: sha256(body),
    payload: audit,
    sizeBytes,
    immutable: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(snapshotReference, {
    endpointId: endpoint.id,
    workspaceId: endpoint.workspaceId,
    clientId: endpoint.clientId,
    siteId: endpoint.siteId,
    assetId,
    sourceAuditId: audit.auditId,
    policyId: policy.id,
    audit,
    posture,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: previousSnapshotDocument.exists ? previousSnapshotDocument.data()?.createdAt : FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.update(authenticated.endpointDocument.ref, {
    assetId,
    matchState,
    matchCandidates,
    computerName: audit.device.computerName,
    loggedInUser: audit.device.loggedInUser ?? null,
    manufacturer: audit.device.manufacturer ?? null,
    model: audit.device.model ?? null,
    serialNumber: audit.device.serialNumber ?? null,
    deviceIdentifier: audit.device.windowsDeviceId ?? endpoint.deviceIdentifier ?? null,
    operatingSystem: audit.operatingSystem.edition ?? null,
    windowsVersion: audit.operatingSystem.version ?? null,
    buildNumber: audit.operatingSystem.buildNumber ?? null,
    architecture: audit.operatingSystem.architecture ?? null,
    antivirusEnabled: audit.security.antivirusEnabled ?? null,
    firewallEnabled: audit.security.firewallEnabled ?? null,
    bitLockerEnabled: audit.security.bitLockerEnabled ?? null,
    secureBootEnabled: audit.security.secureBootEnabled ?? null,
    tpmReady: audit.security.tpmReady ?? null,
    pendingRestart: audit.security.pendingRestart ?? null,
    diskState: posture.diskState,
    healthState: posture.healthState,
    complianceState: posture.complianceState,
    checkInState: "ONLINE",
    monitoringPolicyId: policy.id,
    lastAuditId: audit.auditId,
    lastAuditVersion: audit.scriptVersion,
    lastCheckIn: FieldValue.serverTimestamp(),
    lastSuccessfulCheck: FieldValue.serverTimestamp(),
    searchTokens: networkSearchTokens([
      audit.device.computerName,
      audit.device.serialNumber,
      audit.device.loggedInUser,
      audit.device.manufacturer,
      audit.device.model,
      ...audit.network.adapters.flatMap((adapter) => [...adapter.ipAddresses, adapter.macAddress]),
    ]),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.update(authenticated.credentialDocument.ref, { lastUsedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  for (const change of changes) {
    const changeRef = firestoreAdmin.collection("endpointChanges").doc();
    batch.create(changeRef, {
      endpointId: endpoint.id,
      workspaceId: endpoint.workspaceId,
      clientId: endpoint.clientId,
      siteId: endpoint.siteId,
      assetId,
      sourceAuditId: audit.auditId,
      ...change,
      acknowledgedAt: null,
      acknowledgedById: null,
      relatedAlertId: null,
      relatedTicketId: null,
      detectedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  if (assetId) {
    batch.update(firestoreAdmin.collection("assets").doc(assetId), {
      hostname: audit.device.computerName,
      operatingSystem: audit.operatingSystem.edition ?? null,
      windowsVersion: audit.operatingSystem.version ?? null,
      architecture: audit.operatingSystem.architecture ?? null,
      antivirusProduct: audit.security.antivirusProduct ?? null,
      antivirusStatus: audit.security.antivirusEnabled === true ? "ACTIVE" : "DISABLED",
      bitLockerStatus: audit.security.bitLockerEnabled === true ? "ENABLED" : "DISABLED",
      firewallStatus: audit.security.firewallEnabled === true ? "ENABLED" : "DISABLED",
      lastLoggedInUser: audit.device.loggedInUser ?? null,
      lastCheckIn: FieldValue.serverTimestamp(),
      healthState: posture.healthState,
      complianceState: posture.complianceState,
      monitoringState: "ACTIVE",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  const activeAlertsSnapshot = await firestoreAdmin.collection("networkAlerts").where("endpointId", "==", endpoint.id).get();
  const currentConditionTypes = new Set(conditions.map((condition) => condition.type));
  for (const alertDocument of activeAlertsSnapshot.docs) {
    const alert = alertDocument.data();
    if (["RESOLVED", "CLOSED"].includes(String(alert.status)) || currentConditionTypes.has(String(alert.type))) continue;
    await alertDocument.ref.update({ status: "RESOLVED", resolvedAt: FieldValue.serverTimestamp(), resolvedById: null, updatedAt: FieldValue.serverTimestamp() });
    await firestoreAdmin.collection("networkAlertEvents").add({ alertId: alertDocument.id, endpointId: endpoint.id, workspaceId: endpoint.workspaceId, action: "AUTO_RESOLVED", auditId: audit.auditId, createdAt: FieldValue.serverTimestamp() });
  }
  for (const condition of conditions) await upsertAlert(condition, { ...endpoint, assetId }, audit, policy);
  await authenticated.endpointDocument.ref.update({ activeAlertCount: conditions.length, updatedAt: FieldValue.serverTimestamp() });
  await logIngestion({ endpointId: endpoint.id, workspaceId: endpoint.workspaceId, clientId: endpoint.clientId, siteId: endpoint.siteId, status: "SUCCESS", auditId: audit.auditId, idempotencyKey: headers.idempotencyKey, sizeBytes, ipAddress: headers.ipAddress, userAgent: headers.userAgent });
  await firestoreAdmin.collection("auditLogs").add({
    userId: null,
    action: "endpoints.audit.ingest",
    entityType: "Endpoint",
    entityId: endpoint.id,
    metadata: { auditId: audit.auditId, changeCount: changes.length, alertCount: conditions.length, matchState },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { accepted: true, duplicate: false, auditId: audit.auditId, endpointId: endpoint.id, changeCount: changes.length, alertCount: conditions.length, matchState };
}
