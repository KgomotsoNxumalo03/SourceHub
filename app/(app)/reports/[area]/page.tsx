import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getReport, reportPermission } from "@/lib/reporting";
import { reportAreas, type ReportArea } from "@/lib/reporting-utils";
import { ReportView } from "@/components/report-view";

export const dynamic = "force-dynamic";
export default async function ReportAreaPage({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { const { area: rawArea } = await params; if (!reportAreas.includes(rawArea as ReportArea)) notFound(); const area = rawArea as ReportArea; await requirePermission(reportPermission(area)); const query = await searchParams; const report = await getReport(area, query); return <ReportView report={report} query={query} />; }
