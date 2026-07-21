import { NextRequest, NextResponse } from "next/server";

import { ingestEndpointAudit, NetworkIngestionError } from "@/lib/network-ingestion";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  try {
    const result = await ingestEndpointAudit(body, {
      endpointId: request.headers.get("x-sourcehub-endpoint-id") ?? "",
      credential: request.headers.get("x-sourcehub-credential") ?? "",
      timestamp: request.headers.get("x-sourcehub-timestamp") ?? "",
      nonce: request.headers.get("x-sourcehub-nonce") ?? "",
      signature: request.headers.get("x-sourcehub-signature") ?? "",
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NetworkIngestionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "The audit could not be processed.", code: "INGESTION_FAILED" }, { status: 500 });
  }
}
