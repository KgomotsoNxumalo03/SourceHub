import { randomUUID } from "node:crypto";

import { collectionNames } from "@/lib/collections";
import { firestoreAdmin } from "@/lib/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { authenticateEnterpriseApiRequest, requireApiScope } from "@/lib/enterprise";

const resources: Record<string, { collection: string; scope: "clients.read" | "assets.read" | "endpoints.read" | "projects.read" | "knowledge.read" }> = {
  clients: { collection: collectionNames.clients, scope: "clients.read" },
  assets: { collection: collectionNames.assets, scope: "assets.read" },
  endpoints: { collection: collectionNames.endpoints, scope: "endpoints.read" },
  projects: { collection: collectionNames.projects, scope: "projects.read" },
  knowledge: { collection: collectionNames.knowledgeArticles, scope: "knowledge.read" },
};

function serialise(value: any): any {
  if (Array.isArray(value)) return value.map(serialise);
  if (value?.toDate) return value.toDate().toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["passwordHash", "bankDetails", "secretHash", "tokenHash", "contentHtml"].includes(key))
        .map(([key, child]) => [key, serialise(child)]),
    );
  }
  return value;
}

export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const correlationId = request.headers.get("x-correlation-id")?.slice(0, 120) || randomUUID();

  try {
    const principal = await authenticateEnterpriseApiRequest(request);
    const { resource } = await params;
    const definition = resources[resource];
    if (!definition) return Response.json({ error: "Unsupported API resource.", correlationId }, { status: 404, headers: { "X-Correlation-Id": correlationId } });
    requireApiScope(principal, definition.scope);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
    let query: FirebaseFirestore.Query = firestoreAdmin.collection(definition.collection).where("workspaceId", "==", principal.workspaceId);
    if (resource === "knowledge") query = query.where("status", "==", "PUBLISHED");
    if (principal.clientIds.length && ["clients", "assets", "knowledge"].includes(resource)) query = query.where("clientId", "in", principal.clientIds.slice(0, 10));
    query = query.orderBy("updatedAt", "desc").limit(limit);
    const snapshot = await query.get();

    return Response.json(
      { data: snapshot.docs.map((doc) => serialise({ id: doc.id, ...doc.data() })), pagination: { limit, hasMore: snapshot.size === limit } },
      { headers: { "X-Correlation-Id": correlationId } },
    );
  } catch (error) {
    return apiErrorResponse(error, correlationId);
  }
}
