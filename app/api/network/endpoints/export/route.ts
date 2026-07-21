import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET() {
  const actor = await currentUser();
  if (!actor || !hasPermission(actor, "network_reports.export")) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const endpoints = await prisma.endpoint.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: [{ updatedAt: "desc" }], take: 10000 });
  const headers = ["endpointId", "computerName", "clientId", "siteId", "assetId", "manufacturer", "model", "serialNumber", "windowsVersion", "healthState", "complianceState", "checkInState", "lastCheckIn", "lastSuccessfulCheck"];
  const lines = [headers.map(csvValue).join(","), ...endpoints.map((endpoint) => [endpoint.id, endpoint.computerName, endpoint.clientId, endpoint.siteId, endpoint.assetId, endpoint.manufacturer, endpoint.model, endpoint.serialNumber, endpoint.windowsVersion, endpoint.healthState, endpoint.complianceState, endpoint.checkInState, endpoint.lastCheckIn, endpoint.lastSuccessfulCheck].map(csvValue).join(","))];
  return new NextResponse(lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sourcehub-endpoints-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
