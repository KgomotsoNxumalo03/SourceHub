import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { authenticateMobileRequest, mobileJsonError } from "@/lib/mobile-auth";
import { mobilePushTokenSchema } from "@/lib/validators-mobile";

export async function POST(request: Request) {
  try {
    const { principal } = await authenticateMobileRequest(request);
    const input = mobilePushTokenSchema.parse(await request.json());
    const id = `${principal.workspaceId}:${principal.id}:${input.deviceId}`;
    await firestoreAdmin.collection(collectionNames.mobilePushTokens).doc(id).set({ id, workspaceId: principal.workspaceId, userId: principal.id, deviceId: input.deviceId, token: input.token, platform: input.platform, permissionStatus: input.permissionStatus, status: input.permissionStatus === "granted" ? "ACTIVE" : "DISABLED", lastSeenAt: new Date(), updatedAt: new Date(), createdAt: new Date() }, { merge: true });
    await firestoreAdmin.collection(collectionNames.mobileDevices).doc(`${principal.workspaceId}:${input.deviceId}`).set({ id: `${principal.workspaceId}:${input.deviceId}`, workspaceId: principal.workspaceId, userId: principal.id, deviceId: input.deviceId, platform: input.platform, appVersion: request.headers.get("X-SourceHub-App-Version") ?? "unknown", status: "ACTIVE", lastSeenAt: new Date(), updatedAt: new Date(), createdAt: new Date() }, { merge: true });
    return Response.json({ ok: true });
  } catch (error) { return mobileJsonError(error); }
}
