import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { exchangeEndpointEnrolment, NetworkIngestionError } from "@/lib/network-ingestion";

export const runtime = "nodejs";

const requestSchema = z.object({
  token: z.string().min(20).max(512),
  computerName: z.string().trim().min(1).max(255),
  deviceIdentifier: z.string().trim().max(500).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 32 * 1024) return NextResponse.json({ error: "Request too large.", code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid enrolment request.", code: "INVALID_REQUEST" }, { status: 400 });
    const result = await exchangeEndpointEnrolment({ ...parsed.data, ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NetworkIngestionError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Enrolment could not be completed.", code: "ENROLMENT_FAILED" }, { status: 500 });
  }
}
