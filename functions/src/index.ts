import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serviceAccountPath = process.env.SOURCEHUB_FIREBASE_SERVICE_ACCOUNT_PATH ?? join(process.cwd(), "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
const db = getFirestore(app);

export const runScheduledSlaChecks = onSchedule("every 5 minutes", async () => {
  const snapshot = await db.collection("tickets").where("status", "in", ["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"]).get();
  logger.info("Scheduled SLA sweep", { count: snapshot.size });
});

export const runScheduledEmailPolling = onSchedule("every 5 minutes", async () => {
  const snapshot = await db.collection("emailMessages").where("processingStatus", "in", ["PENDING", "FAILED"]).get();
  logger.info("Scheduled email poll", { count: snapshot.size });
});

export const runScheduledEscalations = onSchedule("every 5 minutes", async () => {
  const snapshot = await db.collection("escalationExecutions").where("status", "==", "PENDING").get();
  logger.info("Scheduled escalation sweep", { count: snapshot.size });
});
