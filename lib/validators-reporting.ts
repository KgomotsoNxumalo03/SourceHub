import { z } from "zod";

export const reportAreaSchema = z.enum(["executive", "service-desk", "clients", "assets", "networks", "employees", "attendance", "projects", "finance", "knowledge", "security"]);
export const reportPresetSchema = z.enum(["today", "yesterday", "this-week", "last-week", "this-month", "last-month", "this-quarter", "this-year", "custom"]);
export const reportingFilterSchema = z.object({
  preset: reportPresetSchema.default("this-month"),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  clientId: z.string().trim().max(100).optional().or(z.literal("")),
  siteId: z.string().trim().max(100).optional().or(z.literal("")),
  departmentId: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.string().trim().max(60).optional().or(z.literal("")),
  priority: z.string().trim().max(40).optional().or(z.literal("")),
  comparison: z.coerce.boolean().default(true),
});
export const savedReportSchema = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).default(""), reportType: z.string().trim().min(1).max(80), area: reportAreaSchema,
  filtersJson: z.string().max(10000), grouping: z.string().trim().max(80).default(""), sorting: z.string().trim().max(80).default(""), columns: z.array(z.string().trim().max(80)).max(50).default([]), chartType: z.enum(["KPI", "TABLE", "LINE", "BAR", "STACKED_BAR", "AREA", "DONUT", "SCATTER"]).default("TABLE"),
});
export const reportScheduleSchema = z.object({
  reportId: z.string().trim().min(1), frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]), timezone: z.string().trim().min(1).max(80), deliveryTime: z.string().regex(/^\d{2}:\d{2}$/), format: z.enum(["CSV", "PDF", "MARKDOWN"]), recipients: z.array(z.string().email()).min(1).max(50), active: z.coerce.boolean().default(true), dateRangeBehaviour: z.enum(["PREVIOUS_PERIOD", "CURRENT_PERIOD", "LAST_30_DAYS"]).default("PREVIOUS_PERIOD"),
});
export const customReportSchema = z.object({
  dataset: z.enum(["tickets", "clients", "assets", "endpoints", "employees", "attendance", "projects", "finance", "knowledge", "security"]), metric: z.string().trim().min(1).max(80), dimension: z.string().trim().max(80), chartType: z.enum(["KPI", "TABLE", "LINE", "BAR", "STACKED_BAR", "AREA", "DONUT", "SCATTER"]), filtersJson: z.string().max(10000),
});
