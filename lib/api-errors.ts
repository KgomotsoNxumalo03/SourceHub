import { z } from "zod";

function classification(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof z.ZodError) return { status: 400, message: "Request validation failed." };
  if (/rate limit/i.test(message)) return { status: 429, message: "API rate limit exceeded." };
  if (/required|invalid|expired|revoked|inactive|disabled/i.test(message) && /api|enterprise|credential|identity|key|provider/i.test(message)) {
    return { status: 401, message: "Enterprise API authentication failed." };
  }
  if (/scope|permitted|permission/i.test(message)) return { status: 403, message: "The API identity is not permitted for this request." };
  if (/maintenance|read-only/i.test(message)) return { status: 503, message: "The requested operation is temporarily unavailable." };
  if (/not found|not available/i.test(message)) return { status: 404, message: "The requested resource was not found." };
  return { status: 400, message: "The API request could not be processed." };
}

export function apiErrorResponse(error: unknown, correlationId: string) {
  const safe = classification(error);
  return Response.json(
    { error: safe.message, correlationId },
    { status: safe.status, headers: { "X-Correlation-Id": correlationId } },
  );
}
