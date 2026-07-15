import "server-only";

import { prisma } from "@/lib/db";
import { serializeJsonValue } from "@/lib/json";

export type AuditValues = unknown;

export async function logAudit({
  userId,
  action,
  entityType,
  entityId,
  previousValues,
  newValues,
  metadata,
  ipAddress,
}: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValues?: AuditValues;
  newValues?: AuditValues;
  metadata?: AuditValues;
  ipAddress?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      previousValues: serializeJsonValue(previousValues as never),
      newValues: serializeJsonValue(newValues as never),
      metadata: serializeJsonValue(metadata as never),
      ipAddress: ipAddress ?? null,
    },
  });
}
