import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET(request: Request) {
  const actor = await currentUser();
  if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!actor.permissions.includes("employees.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status") || "";
  const employmentType = url.searchParams.get("employmentType") || "";
  const employees = await prisma.employee.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, ...(status ? { status } : {}), ...(employmentType ? { employmentType } : {}), ...(search ? { OR: [{ firstName: { contains: search, mode: "insensitive" } }, { lastName: { contains: search, mode: "insensitive" } }, { workEmail: { contains: search, mode: "insensitive" } }, { employeeNumber: { contains: search, mode: "insensitive" } }] } : {}) }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 5000 });
  const canSensitive = actor.permissions.includes("employees.sensitive_view");
  const header = ["employeeNumber", "firstName", "lastName", "workEmail", "jobTitle", "status", "employmentType", "departmentId", "managerId", "startDate", ...(canSensitive ? ["personalEmail", "mobileNumber"] : [])];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [header.join(","), ...employees.map((employee: any) => [employee.employeeNumber, employee.firstName, employee.lastName, employee.workEmail, employee.jobTitle, employee.status, employee.employmentType, employee.departmentId, employee.managerId, employee.startDate instanceof Date ? employee.startDate.toISOString() : employee.startDate, ...(canSensitive ? [employee.personalEmail, employee.mobileNumber] : [])].map(escape).join(","))];
  return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=sourcehub-employees.csv", "Cache-Control": "no-store" } });
}
