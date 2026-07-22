import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getReport, canViewReportArea } from "@/lib/reporting";
import { reportAreaSchema } from "@/lib/validators-reporting";
import { csvEscape } from "@/lib/reporting-utils";

export async function GET(request: Request) {
  const actor = await currentUser(); if (!actor) return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); const url = new URL(request.url); const areaResult = reportAreaSchema.safeParse(url.searchParams.get("area") || "executive"); if (!areaResult.success || !canViewReportArea(actor, areaResult.data)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { const report = await getReport(areaResult.data, Object.fromEntries(url.searchParams.entries())); const rows = [["metric", "value", "previousValue", "changePercent", "unit"], ...report.metrics.map((metric) => [metric.label, metric.value, metric.previousValue, metric.change, metric.unit])]; const grouped = [["group", "value"], ...report.rows.map((row) => [row.label, row.value])]; const body = [...rows, [], ["Grouped data"], ...grouped].map((row) => row.map(csvEscape).join(",")).join("\n"); return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=sourcehub-${areaResult.data}-report.csv` } }); } catch (error: any) { return NextResponse.json({ error: error?.message ?? "Unable to generate report" }, { status: 400 }); }
}
