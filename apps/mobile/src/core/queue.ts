import { mobileApi } from "@mobile/core/api";
import { readQueue, saveQueue } from "@mobile/core/storage";
import type { QueuedOperation, SyncOperation } from "@mobile/core/types";

export async function queueOperation(operation: SyncOperation) {
  const queue = await readQueue<QueuedOperation[]>();
  queue.push({ ...operation, createdAt: new Date().toISOString(), attempts: 0 });
  await saveQueue(queue.slice(-100));
}

export async function syncQueue() {
  const queue = await readQueue<QueuedOperation[]>();
  if (!queue.length) return { completed: 0, failed: 0, pending: 0 };
  const response = await mobileApi.sync(queue.map(({ createdAt: _createdAt, attempts: _attempts, lastError: _lastError, ...operation }) => operation));
  const failed = new Set((response.results ?? []).filter((item: any) => item.status !== "COMPLETED").map((item: any) => item.idempotencyKey));
  const updated = queue.filter((item) => failed.has(item.idempotencyKey)).map((item) => ({ ...item, attempts: item.attempts + 1, lastError: response.results.find((result: any) => result.idempotencyKey === item.idempotencyKey)?.error }));
  await saveQueue(updated);
  return { completed: queue.length - updated.length, failed: updated.length, pending: updated.length };
}
