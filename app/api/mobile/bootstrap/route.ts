import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { authenticateMobileRequest, mobileJsonError } from "@/lib/mobile-auth";

function serialise(value: any): any {
  if (Array.isArray(value)) return value.map(serialise);
  if (value?.toDate && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 120).map(([key, child]) => [key, serialise(child)]));
  return value;
}

export async function GET(request: Request) {
  try {
    const { principal, versionPolicy } = await authenticateMobileRequest(request);
    const workspaceId = principal.workspaceId;
    const [notifications, tickets, assets, tasks, articles] = await Promise.all([
      firestoreAdmin.collection(collectionNames.notifications).where("workspaceId", "==", workspaceId).where("userId", "==", principal.id).orderBy("createdAt", "desc").limit(20).get().catch(() => firestoreAdmin.collection(collectionNames.notifications).where("workspaceId", "==", workspaceId).where("userId", "==", principal.id).limit(20).get()),
      principal.permissions.includes("tickets.view") ? firestoreAdmin.collection(collectionNames.tickets).where("workspaceId", "==", workspaceId).orderBy("updatedAt", "desc").limit(50).get().catch(() => firestoreAdmin.collection(collectionNames.tickets).where("workspaceId", "==", workspaceId).limit(50).get()) : Promise.resolve({ docs: [] } as any),
      principal.mobilePermissions.includes("mobile.assets.view") ? firestoreAdmin.collection(collectionNames.assets).where("workspaceId", "==", workspaceId).orderBy("updatedAt", "desc").limit(50).get().catch(() => firestoreAdmin.collection(collectionNames.assets).where("workspaceId", "==", workspaceId).limit(50).get()) : Promise.resolve({ docs: [] } as any),
      principal.mobilePermissions.includes("mobile.projects.use") ? firestoreAdmin.collection(collectionNames.projectTasks).where("workspaceId", "==", workspaceId).where("assigneeId", "==", principal.id).limit(50).get() : Promise.resolve({ docs: [] } as any),
      principal.mobilePermissions.includes("mobile.knowledge.use") ? firestoreAdmin.collection(collectionNames.knowledgeArticles).where("workspaceId", "==", workspaceId).where("status", "==", "PUBLISHED").limit(30).get() : Promise.resolve({ docs: [] } as any),
    ]);
    return Response.json({ user: principal, versionPolicy, generatedAt: new Date().toISOString(), notifications: notifications.docs.map((doc: any) => serialise({ id: doc.id, ...doc.data() })), tickets: tickets.docs.map((doc: any) => serialise({ id: doc.id, ...doc.data() })), assets: assets.docs.map((doc: any) => serialise({ id: doc.id, ...doc.data() })), tasks: tasks.docs.map((doc: any) => serialise({ id: doc.id, ...doc.data() })), articles: articles.docs.map((doc: any) => serialise({ id: doc.id, title: doc.data().title, summary: doc.data().summary, area: doc.data().area, visibility: doc.data().visibility, updatedAt: doc.data().updatedAt })) });
  } catch (error) { return mobileJsonError(error); }
}
