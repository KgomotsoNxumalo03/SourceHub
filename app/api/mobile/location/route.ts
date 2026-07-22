import { FieldValue } from "firebase-admin/firestore";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { authenticateMobileRequest, mobileJsonError } from "@/lib/mobile-auth";
import { mobileLocationSchema } from "@/lib/validators-mobile";

export async function POST(request: Request) {
  try {
    const { principal } = await authenticateMobileRequest(request);
    if (!principal.mobilePermissions.includes("mobile.location.use")) return Response.json({ error: "Location verification is not enabled for this account." }, { status: 403 });
    const input = mobileLocationSchema.parse(await request.json());
    const id = `${principal.workspaceId}:${principal.id}:${input.deviceId}:${Date.now()}`;
    await firestoreAdmin.collection(collectionNames.mobileLocationEvents).doc(id).create({ id, workspaceId: principal.workspaceId, userId: principal.id, deviceId: input.deviceId, latitude: input.latitude, longitude: input.longitude, accuracyMetres: input.accuracyMetres, workLocationId: input.workLocationId ?? null, purpose: input.purpose, verificationState: input.accuracyMetres <= 200 ? "RECEIVED" : "LOW_ACCURACY", serverReceivedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 30 * 86400000) });
    return Response.json({ accepted: true, verificationState: input.accuracyMetres <= 200 ? "RECEIVED" : "LOW_ACCURACY" });
  } catch (error) { return mobileJsonError(error); }
}
