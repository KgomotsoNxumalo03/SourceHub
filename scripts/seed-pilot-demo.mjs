import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { collectionNames } from "../lib/collections.ts";
import { assertDemoEnvironment, syntheticSeedRecords } from "../lib/pilot-core.ts";

const args = new Set(process.argv.slice(2));
const volumeArg = process.argv.find((arg) => arg.startsWith("--volume="))?.split("=")[1] ?? "small";
const volume = volumeArg === "medium" ? "medium" : "small";
const dryRun = args.has("--dry-run");
const reset = args.has("--reset");
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-sourcehub";
const serviceAccountPath = process.env.SOURCEHUB_FIREBASE_SERVICE_ACCOUNT_PATH ?? process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

assertDemoEnvironment({
  nodeEnv: process.env.NODE_ENV,
  projectId,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
  approvedNonProduction: args.has("--approved-non-production"),
});

if (reset && !args.has("--confirm-reset")) throw new Error("Reset requires --confirm-reset in addition to --reset.");
if (reset && process.env.PILOT_DEMO_RESET_ENABLED !== "true") throw new Error("Demo reset is disabled. Set PILOT_DEMO_RESET_ENABLED=true only in an approved demo environment.");

const app = getApps()[0] ?? initializeApp(serviceAccountPath && existsSync(serviceAccountPath) ? { credential: cert(JSON.parse(readFileSync(serviceAccountPath, "utf8"))), projectId } : { projectId });
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const generatedCollections = [
  collectionNames.workspaces, collectionNames.users, collectionNames.roles, collectionNames.teams, collectionNames.clients,
  collectionNames.clientContacts, collectionNames.tickets, collectionNames.ticketComments, collectionNames.slaPolicies,
  collectionNames.assets, collectionNames.networkDevices, collectionNames.employees, collectionNames.attendanceEvents,
  collectionNames.projects, collectionNames.projectTasks, collectionNames.timesheets, collectionNames.invoices,
  collectionNames.knowledgeArticles, collectionNames.reportDefinitions, collectionNames.notifications,
  collectionNames.automationWorkflows, collectionNames.auditLogs, collectionNames.operationalFeedback,
  collectionNames.pilotPrograms, collectionNames.pilotScenarios,
];

const now = new Date("2026-07-23T08:00:00.000Z");
const tenants = syntheticSeedRecords(volume);
const records = [];
const add = (collection, id, data) => records.push({ collection, id, data: { id, ...data, synthetic: true, seedKey: `phase20:${data.tenantId ?? data.workspaceId ?? id}`, createdAt: now, updatedAt: now } });

for (const tenant of tenants) {
  const workspaceId = tenant.workspaceId;
  const tenantId = tenant.tenantId;
  add(collectionNames.workspaces, workspaceId, { workspaceId, tenantId, name: tenant.name, companyName: tenant.name, status: "ACTIVE", environment: "SYNTHETIC_DEMO", domain: tenant.domain });
  add(collectionNames.roles, `${workspaceId}:tenant-owner`, { workspaceId, tenantId, name: "Synthetic Tenant Owner", key: "SYNTHETIC_TENANT_OWNER" });
  add(collectionNames.teams, `${workspaceId}:service-desk`, { workspaceId, tenantId, name: "Synthetic Service Desk", description: "Fictional team for pilot workflow testing." });
  add(collectionNames.users, `${workspaceId}:alex`, { workspaceId, tenantId, firstName: "Alex", lastName: "Example", email: `alex@${tenant.domain}`, status: "ACTIVE", synthetic: true, firebaseUid: null, roleKeys: ["SYNTHETIC_TENANT_OWNER"] });
  add(collectionNames.clients, `${workspaceId}:client`, { workspaceId, tenantId, name: `Example Client ${workspaceId.slice(-1).toUpperCase()}`, status: "ACTIVE", industry: "Fictional services" });
  add(collectionNames.clientContacts, `${workspaceId}:contact`, { workspaceId, tenantId, clientId: `${workspaceId}:client`, firstName: "Jordan", lastName: "Example", email: `jordan@${tenant.domain}`, role: "Synthetic client contact" });
  add(collectionNames.tickets, `${workspaceId}:ticket`, { workspaceId, tenantId, ticketReference: `SYN-${workspaceId.slice(-1).toUpperCase()}-001`, title: "Fictional access request", description: "Synthetic ticket content for controlled workflow testing.", status: "IN_PROGRESS", priority: "NORMAL", clientId: `${workspaceId}:client` });
  add(collectionNames.ticketComments, `${workspaceId}:comment`, { workspaceId, tenantId, ticketId: `${workspaceId}:ticket`, body: "Synthetic triage note. Do not use for real support.", visibility: "INTERNAL" });
  add(collectionNames.slaPolicies, `${workspaceId}:sla`, { workspaceId, tenantId, name: "Synthetic business-hours SLA", responseMinutes: 60, resolutionMinutes: 480, active: true });
  add(collectionNames.assets, `${workspaceId}:asset`, { workspaceId, tenantId, assetTag: `SYN-ASSET-${workspaceId.slice(-1).toUpperCase()}-001`, name: "Fictional laptop", serialNumber: `EXAMPLE-SERIAL-${workspaceId.slice(-1).toUpperCase()}`, status: "DEPLOYED", clientId: `${workspaceId}:client` });
  add(collectionNames.networkDevices, `${workspaceId}:device`, { workspaceId, tenantId, name: "synthetic-router", ipAddress: "192.0.2.10", serialNumber: `DOC-${workspaceId.slice(-1).toUpperCase()}-001`, status: "ACTIVE" });
  add(collectionNames.employees, `${workspaceId}:employee`, { workspaceId, tenantId, firstName: "Taylor", lastName: "Example", employeeNumber: `SYN-${workspaceId.slice(-1).toUpperCase()}-001`, status: "ACTIVE", email: `taylor@${tenant.domain}` });
  add(collectionNames.attendanceEvents, `${workspaceId}:attendance`, { workspaceId, tenantId, employeeId: `${workspaceId}:employee`, eventType: "CLOCK_IN", eventAt: now, verificationMode: "SYNTHETIC_DEMO" });
  add(collectionNames.projects, `${workspaceId}:project`, { workspaceId, tenantId, name: "Synthetic onboarding project", status: "IN_PROGRESS", ownerId: `${workspaceId}:alex` });
  add(collectionNames.projectTasks, `${workspaceId}:task`, { workspaceId, tenantId, projectId: `${workspaceId}:project`, title: "Validate synthetic workflow", status: "IN_PROGRESS", progressPercentage: 50 });
  add(collectionNames.timesheets, `${workspaceId}:timesheet`, { workspaceId, tenantId, employeeId: `${workspaceId}:employee`, projectId: `${workspaceId}:project`, durationMinutes: 60, billable: false });
  add(collectionNames.invoices, `${workspaceId}:invoice`, { workspaceId, tenantId, clientId: `${workspaceId}:client`, invoiceNumber: `SYN-INV-${workspaceId.slice(-1).toUpperCase()}-001`, currency: "ZAR", totalMinorUnits: 125000, status: "DRAFT" });
  add(collectionNames.knowledgeArticles, `${workspaceId}:article`, { workspaceId, tenantId, title: "Synthetic access checklist", slug: `synthetic-access-${workspaceId.slice(-1)}`, status: "PUBLISHED", visibility: "INTERNAL", contentHtml: "<p>Fictional guidance for the demo environment.</p>" });
  add(collectionNames.reportDefinitions, `${workspaceId}:report`, { workspaceId, tenantId, name: "Synthetic service desk report", area: "service-desk", status: "ACTIVE" });
  add(collectionNames.notifications, `${workspaceId}:notification`, { workspaceId, tenantId, userId: `${workspaceId}:alex`, title: "Synthetic pilot reminder", message: "This is fictional demo data.", readAt: null });
  add(collectionNames.automationWorkflows, `${workspaceId}:automation`, { workspaceId, tenantId, name: "Synthetic ticket acknowledgement", status: "DRAFT", version: 1, steps: [] });
  add(collectionNames.auditLogs, `${workspaceId}:audit`, { workspaceId, tenantId, action: "SYNTHETIC_SEED", actorId: `${workspaceId}:alex`, targetType: "SyntheticDemo", targetId: workspaceId });
  add(collectionNames.operationalFeedback, `${workspaceId}:feedback`, { workspaceId, tenantId, userId: `${workspaceId}:alex`, pilotId: `${workspaceId}:pilot`, category: "GENERAL", feedbackType: "POSITIVE", module: "Synthetic demo", description: "Synthetic feedback placeholder; not a real user report.", impact: "LOW", frequency: "ONCE", visibility: "PRIVATE", status: "NEW", voteCount: 0 });
  add(collectionNames.pilotPrograms, `${workspaceId}:pilot`, { workspaceId, tenantId, name: `Synthetic internal pilot ${workspaceId.slice(-1).toUpperCase()}`, description: "Fictional pilot record for local evidence testing.", status: "DRAFT", participatingWorkspaceId: workspaceId, participantUserIds: [`${workspaceId}:alex`], participantRoles: ["Synthetic tenant owner"], enabledModules: ["tickets", "assets", "projects"], successCriteria: ["No cross-tenant reads in the emulator"], knownLimitations: ["Synthetic data is not production evidence"], commercialModeActivated: false });
  for (const [key, title, module, expected] of [["service-desk", "Synthetic Service Desk scenario", "tickets", "A synthetic ticket moves through a controlled lifecycle."], ["tenant-isolation", "Synthetic Tenant Isolation scenario", "security", "Cross-tenant access is denied."]]) add(collectionNames.pilotScenarios, `${workspaceId}:${key}`, { workspaceId, tenantId, pilotId: `${workspaceId}:pilot`, scenarioKey: key, title, module, expectedResult: expected, status: "NOT_RUN" });
}

async function resetSynthetic() {
  if (dryRun) return;
  let deleted = 0;
  for (const collection of generatedCollections) {
    const snapshot = await db.collection(collection).where("synthetic", "==", true).limit(400).get();
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    if (!snapshot.empty) await batch.commit();
    deleted += snapshot.size;
  }
  console.log(`Synthetic reset deleted ${deleted} marked demo records.`);
}

async function seed() {
  if (reset) await resetSynthetic();
  if (dryRun) { console.log(`Dry run: ${records.length} synthetic records would be written for ${tenants.length} tenants.`); return; }
  for (let index = 0; index < records.length; index += 400) {
    const batch = db.batch();
    records.slice(index, index + 400).forEach(({ collection, id, data }) => batch.set(db.collection(collection).doc(id), data, { merge: true }));
    await batch.commit();
  }
  const crossTenantReferences = records.filter(({ data }) => data.tenantId && data.workspaceId && data.tenantId !== data.workspaceId);
  if (crossTenantReferences.length) throw new Error("Synthetic seed validation failed: a generated record has mismatched tenant and workspace scope.");
  console.log(`Seeded ${records.length} deterministic synthetic records for ${tenants.length} tenants. All records are labelled synthetic.`);
}

seed().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
