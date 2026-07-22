import Link from "next/link";
import { Badge, Button, Card, CardContent, Input, PageHeader, Select, StatCard, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Textarea } from "@/components/ui";
import { buttonClassName } from "@/lib/button";
import { ReportBarChart, ReportTrendChart } from "@/components/report-charts";
import { reportAreaLabels, type ReportArea } from "@/lib/reporting-utils";
import type { ReportResult } from "@/lib/reporting";
import { createReportExportAction, saveDashboardPreferenceAction, saveReportAction } from "@/lib/actions/reporting";
import { AiContextLink } from "@/components/ai-context-link";

export function ReportFilters({ area, query }: { area: ReportArea; query: Record<string, string | string[] | undefined> }) {
  const get = (key: string) => { const value = query[key]; return Array.isArray(value) ? value[0] ?? "" : value ?? ""; };
  return <Card><CardContent><form className="grid gap-3 md:grid-cols-4" method="get"><label className="text-sm font-medium">Period<Select name="preset" defaultValue={get("preset") || "this-month"}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="this-week">This week</option><option value="last-week">Last week</option><option value="this-month">This month</option><option value="last-month">Last month</option><option value="this-quarter">This quarter</option><option value="this-year">This year</option><option value="custom">Custom range</option></Select></label><label className="text-sm font-medium">Start date<Input name="start" type="date" defaultValue={get("start")} /></label><label className="text-sm font-medium">End date<Input name="end" type="date" defaultValue={get("end")} /></label><label className="text-sm font-medium">Client scope<Input name="clientId" defaultValue={get("clientId")} placeholder="Optional client ID" /></label><div className="flex items-end gap-2 md:col-span-4"><Button type="submit">Apply filters</Button><Link href={`/reports/${area}`} className={buttonClassName({ variant: "outline" })}>Reset</Link><label className="ml-auto flex items-center gap-2 pb-2 text-sm text-slate-600"><input type="checkbox" name="comparison" value="true" defaultChecked={get("comparison") !== "false"} /> Compare previous period</label></div></form></CardContent></Card>;
}

export function ReportView({ report, query, showSave = true, aiEnabled = false }: { report: ReportResult; query: Record<string, string | string[] | undefined>; showSave?: boolean; aiEnabled?: boolean }) {
  const freshnessLabel = report.freshness === "CURRENT" ? "Current" : "Stale aggregate";
  const filtersJson = JSON.stringify({ preset: report.range.preset, start: report.range.start.toISOString().slice(0, 10), end: report.range.end.toISOString().slice(0, 10), clientId: String(query.clientId ?? "") });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reporting & Analytics"
        title={`${report.label} dashboard`}
        description="Server-aggregated operational reporting with visible definitions, comparison context and freshness."
        actions={<div className="flex flex-wrap gap-2"><AiContextLink module="reports" type="report" id={report.area} enabled={aiEnabled} /><Link href={`/api/reports/export?area=${report.area}&preset=${report.range.preset}`} className={buttonClassName({ variant: "outline" })}>Export CSV</Link><form action={createReportExportAction}><input type="hidden" name="area" value={report.area} /><input type="hidden" name="preset" value={report.range.preset} /><input type="hidden" name="format" value="CSV" /><Button type="submit" variant="secondary">Queue export</Button></form></div>}
      />
      <ReportFilters area={report.area} query={query} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><Badge tone={report.freshness === "CURRENT" ? "success" : "warning"}>{freshnessLabel}</Badge><span>Generated {report.generatedAt.toLocaleString("en-ZA", { timeZone: report.range.timezone })}</span><span>Data updated {report.dataLastUpdated?.toLocaleString("en-ZA", { timeZone: report.range.timezone }) ?? "Not available"}</span><span>Aggregation {report.aggregationLastCompleted?.toLocaleString("en-ZA", { timeZone: report.range.timezone }) ?? "Not completed"}</span><span>Calculation v{Math.max(...report.calculationVersions)}</span></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{report.metrics.map((item) => { const display = item.value == null ? "No data" : item.unit === "percent" ? `${item.value.toFixed(1)}%` : Math.round(item.value).toLocaleString("en-ZA"); return <StatCard key={item.key} label={item.label} value={item.href ? <Link href={item.href} className="hover:text-sourcehub-primary">{display}</Link> : display} hint={item.change == null ? item.unit === "percent" ? "Percentage metric" : "Current period" : `${item.change >= 0 ? "+" : ""}${item.change.toFixed(1)}% vs previous equivalent period`} />; })}</div>
      <div className="grid gap-6 xl:grid-cols-2"><ReportTrendChart title="Trend in selected period" points={report.trend} /><ReportBarChart title="Grouped results" rows={report.rows} /></div>
      {showSave ? <Card><CardContent><details><summary className="cursor-pointer font-semibold">Save this report configuration</summary><form action={saveReportAction} className="mt-4 grid gap-3 md:grid-cols-2"><input type="hidden" name="area" value={report.area} /><input type="hidden" name="reportType" value={`${report.area}-dashboard`} /><input type="hidden" name="filtersJson" value={filtersJson} /><Input name="name" placeholder={`${reportAreaLabels[report.area]} report`} required /><Input name="description" placeholder="What decision does this report support?" /><Select name="chartType"><option>TABLE</option><option>BAR</option><option>LINE</option><option>KPI</option></Select><Input name="grouping" defaultValue="status" placeholder="Grouping" /><Textarea name="columns" placeholder="Columns, comma separated" className="md:col-span-2" /><Button type="submit">Save report</Button></form></details></CardContent></Card> : null}
      {report.notes.length ? <Card className="border-sourcehub-border bg-sourcehub-muted/40"><CardContent><h2 className="font-semibold">Definitions and limitations</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">{report.notes.map((note) => <li key={note}>{note}</li>)}</ul></CardContent></Card> : null}
      <Card><CardContent><details><summary className="cursor-pointer font-semibold">Remember dashboard filters</summary><form action={saveDashboardPreferenceAction} className="mt-3"><input type="hidden" name="area" value={report.area} /><input type="hidden" name="filtersJson" value={filtersJson} /><Button type="submit" size="sm" variant="outline">Set as default</Button></form></details></CardContent></Card>
    </div>
  );
}
