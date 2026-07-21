import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { serverDate } from "@/lib/attendance";
import { formatDateTime } from "@/lib/utils";
import { createAttendanceExceptionAction } from "@/lib/actions/attendance";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Textarea } from "@/components/ui";

export default async function AttendanceReportsPage() {
  const actor = await requirePermission("attendance.reports");
  const [events, exceptions, employees] = await Promise.all([
    prisma.attendanceEvent.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { serverTimestamp: "desc" }, take: 200 }),
    prisma.attendanceException.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.employee.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: { notIn: ["ARCHIVED", "FORMER_EMPLOYEE"] } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 500 }),
  ]);
  const names = new Map(employees.map((employee: any) => [employee.id, `${employee.firstName} ${employee.lastName}`]));
  return <div className="space-y-6"><PageHeader eyebrow="Time & Attendance" title="Attendance reports" description="Review attendance events and exceptions. Precise location details are excluded from ordinary reporting." actions={<Link href="/attendance" className="text-sm font-semibold text-sourcehub-primary">Back to attendance</Link>} /><div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]"><Card><CardHeader><CardTitle>Recent events</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHead><TableRow><TableHeadCell>Employee</TableHeadCell><TableHeadCell>Event</TableHeadCell><TableHeadCell>Time</TableHeadCell><TableHeadCell>Mode</TableHeadCell><TableHeadCell>Verification</TableHeadCell></TableRow></TableHead><TableBody>{events.map((event: any) => <TableRow key={event.id}><TableCell>{names.get(event.employeeId) || event.employeeId}</TableCell><TableCell>{event.eventType.replaceAll("_", " ")}</TableCell><TableCell>{formatDateTime(serverDate(event.serverTimestamp))}</TableCell><TableCell>{event.workMode || "—"}</TableCell><TableCell><Badge tone={event.verificationState === "UNAVAILABLE" ? "warning" : "outline"}>{event.verificationState || "Not required"}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card><div className="space-y-6"><Card><CardHeader><CardTitle>Open exceptions</CardTitle></CardHeader><CardContent className="space-y-3">{exceptions.map((exception: any) => <div key={exception.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold">{names.get(exception.employeeId) || exception.employeeId}</p><p className="mt-1 text-xs text-amber-900">{exception.exceptionType} · {exception.reason}</p></div>)}{exceptions.length === 0 ? <p className="text-sm text-slate-500">No open exceptions.</p> : null}</CardContent></Card>{actor.permissions.includes("attendance.exceptions.manage") ? <Card><CardHeader><CardTitle>Record exception</CardTitle></CardHeader><CardContent><form action={createAttendanceExceptionAction} className="space-y-3"><Select name="employeeId" required><option value="">Select employee</option>{employees.map((employee: any) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}</Select><Select name="exceptionType"><option value="MISSED_CLOCK_IN">Missed clock-in</option><option value="LOCATION_VERIFICATION">Location verification</option><option value="INCOMPLETE_BREAK">Incomplete break</option><option value="OTHER">Other</option></Select><Textarea name="reason" placeholder="Reason for review" required /><Button type="submit">Create exception</Button></form></CardContent></Card> : null}</div></div></div>;
}
