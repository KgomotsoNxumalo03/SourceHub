export type MobilePrincipal = {
  id: string;
  workspaceId: string;
  email: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  status: string;
  permissions: string[];
  roles: string[];
  portalClientId: string | null;
  mobilePermissions: string[];
  sessionId: string;
};

export type MobileBootstrap = {
  user: MobilePrincipal;
  versionPolicy: { currentVersion: string; minimumSupportedVersion: string; recommendedVersion: string; updateRequired: boolean; updateAvailable: boolean };
  generatedAt: string;
  notifications: Array<Record<string, any>>;
  tickets: Array<Record<string, any>>;
  assets: Array<Record<string, any>>;
  tasks: Array<Record<string, any>>;
  articles: Array<Record<string, any>>;
};

export type SyncOperation = {
  idempotencyKey: string;
  type: "ticket.reply" | "ticket.note" | "ticket.update" | "notification.read" | "attendance.clock_in" | "attendance.clock_out" | "attendance.break_start" | "attendance.break_end" | "task.update" | "maintenance.create";
  payload: Record<string, unknown>;
  clientRecordedAt?: string;
  baseUpdatedAt?: string;
};

export type QueuedOperation = SyncOperation & { createdAt: string; attempts: number; lastError?: string };
