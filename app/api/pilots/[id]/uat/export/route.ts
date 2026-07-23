import { requirePermission } from "@/lib/auth";
import { getPilotDetail } from "@/lib/pilot";
import { escapeCsvCell } from "@/lib/pilot-core";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("pilots.view");
  const { id } = await params;
  const detail = await getPilotDetail(id, actor);
  const header = ["Pilot", "Scenario", "Persona", "Module", "Status", "Actual result", "Evidence", "Linked defect"];
  const rows = detail.cases.map((item: any) => [detail.pilot.name, item.title, item.persona, item.module, item.status, item.actualResult, item.evidence, item.linkedDefectId].map(escapeCsvCell).join(","));
  return new Response([header.map(escapeCsvCell).join(","), ...rows, ""].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sourcehub-pilot-${id}-uat.csv"`, "Cache-Control": "private, no-store" } });
}
