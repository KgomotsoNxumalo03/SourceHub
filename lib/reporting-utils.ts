export type ReportingPreset = "today" | "yesterday" | "this-week" | "last-week" | "this-month" | "last-month" | "this-quarter" | "this-year" | "custom";
export type ReportDateRange = { preset: ReportingPreset; start: Date; end: Date; comparisonStart: Date; comparisonEnd: Date; timezone: string };

export type KpiDefinition = {
  key: string;
  name: string;
  description: string;
  purpose: string;
  source: string[];
  calculation: string;
  included: string;
  excluded: string;
  dateBasis: string;
  unit: string;
  refreshFrequency: string;
  owner: string;
  version: number;
  effectiveFrom: string;
  requiredPermission: string;
};

export const reportAreas = ["executive", "service-desk", "clients", "assets", "networks", "employees", "attendance", "projects", "finance", "knowledge", "security"] as const;
export type ReportArea = (typeof reportAreas)[number];

export const reportAreaLabels: Record<ReportArea, string> = {
  executive: "Executive",
  "service-desk": "Service Desk",
  clients: "Clients",
  assets: "Assets",
  networks: "Networks",
  employees: "Employees",
  attendance: "Attendance",
  projects: "Projects",
  finance: "Finance",
  knowledge: "Knowledge",
  security: "Security and Audit",
};

export const kpiDefinitions: KpiDefinition[] = [
  { key: "tickets.open", name: "Open tickets", description: "Tickets not resolved or closed at the end of the selected period.", purpose: "Show current service desk workload.", source: ["tickets"], calculation: "Count tickets whose status is not RESOLVED or CLOSED.", included: "Workspace-scoped service desk tickets.", excluded: "Resolved and closed tickets.", dateBasis: "Current state at period end.", unit: "tickets", refreshFrequency: "Hourly aggregate, eventual consistency.", owner: "Service Desk", version: 1, effectiveFrom: "2026-01-01", requiredPermission: "reports.service_desk.view" },
  { key: "tickets.sla_compliance", name: "SLA compliance", description: "The percentage of measured tickets resolved within their applicable SLA target.", purpose: "Monitor service commitments.", source: ["tickets", "slaEvents"], calculation: "Resolved within SLA divided by all resolved tickets with a measurable SLA, multiplied by 100.", included: "Tickets with a recorded SLA outcome.", excluded: "Tickets without an SLA outcome.", dateBasis: "Resolution date.", unit: "percent", refreshFrequency: "Hourly aggregate, eventual consistency.", owner: "Service Desk", version: 1, effectiveFrom: "2026-01-01", requiredPermission: "reports.service_desk.view" },
  { key: "finance.outstanding_invoices", name: "Outstanding invoices", description: "The authoritative unpaid balance for issued finance invoices.", purpose: "Support operational collections follow-up.", source: ["invoices", "paymentAllocations"], calculation: "Sum of invoice totalMinorUnits minus authoritative amountPaidMinorUnits for non-void invoices.", included: "Issued operational invoices in the workspace.", excluded: "Draft and void invoices.", dateBasis: "Invoice state at query time.", unit: "minor currency units", refreshFrequency: "Hourly aggregate, eventual consistency.", owner: "Finance", version: 1, effectiveFrom: "2026-01-01", requiredPermission: "reports.finance.view" },
  { key: "projects.progress", name: "Project progress", description: "Completed project tasks as a percentage of non-cancelled tasks.", purpose: "Explain delivery progress without combining unrelated risk scores.", source: ["projectTasks"], calculation: "Completed task count divided by non-cancelled task count, multiplied by 100.", included: "Tasks belonging to workspace projects.", excluded: "Cancelled tasks.", dateBasis: "Task status at query time.", unit: "percent", refreshFrequency: "Hourly aggregate, eventual consistency.", owner: "Projects", version: 1, effectiveFrom: "2026-01-01", requiredPermission: "reports.projects.view" },
  { key: "endpoints.compliance", name: "Endpoint compliance", description: "The percentage of managed endpoints currently marked compliant.", purpose: "Show endpoint security posture.", source: ["endpoints"], calculation: "Compliant managed endpoints divided by managed endpoints, multiplied by 100.", included: "Workspace-managed endpoints.", excluded: "Archived or unmonitored endpoints where applicable.", dateBasis: "Latest endpoint snapshot.", unit: "percent", refreshFrequency: "15-minute network checks plus hourly report aggregate.", owner: "Networks", version: 1, effectiveFrom: "2026-01-01", requiredPermission: "reports.networks.view" },
  { key: "knowledge.helpfulness", name: "Knowledge helpfulness", description: "Positive article feedback as a percentage of explicitly helpful or unhelpful feedback.", purpose: "Identify useful and weak guidance.", source: ["knowledgeFeedback"], calculation: "HELPFUL feedback divided by HELPFUL plus NOT_HELPFUL feedback, multiplied by 100.", included: "Explicit article feedback in the selected period.", excluded: "Correction and broken-link feedback.", dateBasis: "Feedback creation time.", unit: "percent", refreshFrequency: "Hourly aggregate, eventual consistency.", owner: "Knowledge", version: 1, effectiveFrom: "2026-01-01", requiredPermission: "reports.knowledge.view" },
];

function dateOnly(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function startOfWeek(date: Date) { const result = dateOnly(date); const day = result.getDay(); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result; }
function startOfQuarter(date: Date) { const result = dateOnly(date); result.setMonth(Math.floor(result.getMonth() / 3) * 3, 1); return result; }
function addDays(date: Date, days: number) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }

export function resolveReportDateRange(preset: ReportingPreset = "this-month", startInput?: string, endInput?: string, now = new Date(), timezone = "Africa/Johannesburg"): ReportDateRange {
  const today = dateOnly(now); let start = today; let end = addDays(today, 1);
  if (preset === "yesterday") { start = addDays(today, -1); end = today; }
  if (preset === "this-week") { start = startOfWeek(today); end = addDays(start, 7); }
  if (preset === "last-week") { end = startOfWeek(today); start = addDays(end, -7); }
  if (preset === "last-month") { end = new Date(today.getFullYear(), today.getMonth(), 1); start = new Date(today.getFullYear(), today.getMonth() - 1, 1); }
  if (preset === "this-month") { start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(today.getFullYear(), today.getMonth() + 1, 1); }
  if (preset === "this-quarter") { start = startOfQuarter(today); end = new Date(start.getFullYear(), start.getMonth() + 3, 1); }
  if (preset === "this-year") { start = new Date(today.getFullYear(), 0, 1); end = new Date(today.getFullYear() + 1, 0, 1); }
  if (preset === "custom") { const parsedStart = startInput ? new Date(`${startInput}T00:00:00`) : null; const parsedEnd = endInput ? new Date(`${endInput}T00:00:00`) : null; if (parsedStart && Number.isFinite(parsedStart.getTime())) start = parsedStart; if (parsedEnd && Number.isFinite(parsedEnd.getTime())) end = addDays(parsedEnd, 1); }
  if (end <= start) end = addDays(start, 1);
  const duration = end.getTime() - start.getTime();
  return { preset, start, end, comparisonStart: new Date(start.getTime() - duration), comparisonEnd: start, timezone, };
}

export function percentageChange(current: number, previous: number) { if (previous === 0) return current === 0 ? 0 : null; return ((current - previous) / Math.abs(previous)) * 100; }
export function percentage(numerator: number, denominator: number) { return denominator === 0 ? null : (numerator / denominator) * 100; }
export function safeCsvCell(value: unknown) { const text = String(value ?? ""); return /^[=+\-@]/.test(text) ? `'${text}` : text; }
export function csvEscape(value: unknown) { return `"${safeCsvCell(value).replaceAll('"', '""')}"`; }
export function periodKey(date: Date, granularity: "day" | "month" = "day") { return granularity === "month" ? date.toISOString().slice(0, 7) : date.toISOString().slice(0, 10); }
export function freshnessState(generatedAt: Date | string | null | undefined, staleAfterMinutes: number, now = new Date()) { if (!generatedAt) return "STALE" as const; const age = now.getTime() - new Date(generatedAt).getTime(); return age <= staleAfterMinutes * 60_000 ? "CURRENT" as const : "STALE" as const; }
export function metricTone(value: number | null, goodWhen: "higher" | "lower" = "higher") { if (value == null) return "outline" as const; if (goodWhen === "higher") return value >= 80 ? "success" as const : value >= 60 ? "warning" as const : "danger" as const; return value <= 5 ? "success" as const : value <= 15 ? "warning" as const : "danger" as const; }
export function formatReportValue(value: number | null | undefined, unit = "number") { if (value == null) return "No data"; if (unit === "percent") return `${value.toFixed(1)}%`; if (unit === "minor currency units") return value.toLocaleString("en-ZA"); return Math.round(value).toLocaleString("en-ZA"); }
