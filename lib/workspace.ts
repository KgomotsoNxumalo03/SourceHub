import { env } from "@/lib/env";

export const defaultWorkspaceId = env.DEFAULT_WORKSPACE_ID;
export const defaultWorkspaceName = env.DEFAULT_WORKSPACE_NAME;

export function workspaceScopeWhere(workspaceId = defaultWorkspaceId) {
  return { workspaceId };
}

export function workspaceClientScopeWhere(workspaceId = defaultWorkspaceId, clientId?: string | null) {
  return {
    workspaceId,
    ...(clientId ? { clientId } : {}),
  };
}

export function workspacePath(...segments: string[]) {
  return ["workspaces", defaultWorkspaceId, ...segments].join("/");
}
