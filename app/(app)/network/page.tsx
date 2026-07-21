import Link from "next/link";
import { Activity, AlertTriangle, Boxes, Clock3, Globe2, ShieldCheck, WifiOff } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { buttonClassName } from "@/lib/button";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { alertSeverityLabels, endpointComplianceLabels, endpointHealthLabels, monitoringStateLabels } from "@/lib/network";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, StatCard, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

const severityTone: Record<string, "info" | "success" | "warning" | "danger"> = {
  INFO: "info",
  LOW: "info",
  MEDIUM: "warning",
  HIGH: "danger",
  CRITICAL: "danger",
};

export default async function NetworkDashboardPage() {
  await requirePermission("networks.view");
  const workspaceId = env.DEFAULT_WORKSPACE_ID;
  const [managedEndpoints, onlineEndpoints, offlineEndpoints, healthyEndpoints, atRiskEndpoints, criticalEndpoints, openAlerts, criticalAlerts, lowDiskEndpoints, unencryptedEndpoints, antivirusGaps, firewallGaps, environments, recentChanges, recentAlerts] = await Promise.all([
    prisma.endpoint.count({ where: { workspaceId, monitoringState: { not: "ARCHIVED" } } }),
    prisma.endpoint.count({ where: { workspaceId, checkInState: "ONLINE", monitoringState: { not: "ARCHIVED" } } }),
    prisma.endpoint.count({ where: { workspaceId, checkInState: { in: ["OFFLINE", "NEVER_CHECKED_IN"] }, monitoringState: { not: "ARCHIVED" } } }),
    prisma.endpoint.count({ where: { workspaceId, healthState: "HEALTHY", monitoringState: { not: "ARCHIVED" } } }),
    prisma.endpoint.count({ where: { workspaceId, healthState: "AT_RISK", monitoringState: { not: "ARCHIVED" } } }),
    prisma.endpoint.count({ where: { workspaceId, healthState: "CRITICAL", monitoringState: { not: "ARCHIVED" } } }),
    prisma.networkAlert.count({ where: { workspaceId, status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] } } }),
    prisma.networkAlert.count({ where: { workspaceId, severity: "CRITICAL", status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] } } }),
    prisma.endpoint.count({ where: { workspaceId, diskState: { in: ["WARNING", "CRITICAL"] }, monitoringState: { not: "ARCHIVED" } } }),
    prisma.endpoint.count({ where: { workspaceId, bitLockerEnabled: false, monitoringState: { not: "ARCHIVED" } } }),
    prisma.endpoint.count({ where: { workspaceId, antivirusEnabled: false, monitoringState: { not: "ARCHIVED" } } }),
    prisma.endpoint.count({ where: { workspaceId, firewallEnabled: false, monitoringState: { not: "ARCHIVED" } } }),
    prisma.networkEnvironment.count({ where: { workspaceId, archivedAt: null } }),
    prisma.endpointChange.findMany({ where: { workspaceId }, orderBy: [{ detectedAt: "desc" }], take: 8 }),
    prisma.networkAlert.findMany({ where: { workspaceId, status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] } }, orderBy: [{ lastDetectedAt: "desc" }], take: 8 }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Network Management"
        title="Operational network view"
        description="See endpoint posture, network environments, and actionable security signals across the workspace."
        actions={<Link href="/network/endpoints" className={buttonClassName({ variant: "primary" })}>View endpoints</Link>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Managed endpoints" value={managedEndpoints.toLocaleString()} hint="Enrolled Windows devices" icon={<Boxes className="h-5 w-5" />} />
        <StatCard label="Online" value={onlineEndpoints.toLocaleString()} hint={`${offlineEndpoints} offline or not checked in`} icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Open alerts" value={openAlerts.toLocaleString()} hint={`${criticalAlerts} critical`} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Environments" value={environments.toLocaleString()} hint="Client and site network scopes" icon={<Globe2 className="h-5 w-5" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-4 p-5"><ShieldCheck className="h-8 w-8 text-emerald-600" /><div><p className="text-2xl font-bold">{healthyEndpoints}</p><p className="text-sm text-slate-500">Healthy endpoints</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><AlertTriangle className="h-8 w-8 text-amber-600" /><div><p className="text-2xl font-bold">{atRiskEndpoints}</p><p className="text-sm text-slate-500">At-risk endpoints</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><AlertTriangle className="h-8 w-8 text-red-600" /><div><p className="text-2xl font-bold">{criticalEndpoints}</p><p className="text-sm text-slate-500">Critical endpoints</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><WifiOff className="h-8 w-8 text-slate-500" /><div><p className="text-2xl font-bold">{offlineEndpoints}</p><p className="text-sm text-slate-500">Offline or overdue</p></div></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Security posture gaps</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Link href="/network/endpoints?diskState=WARNING" className="rounded-2xl border border-sourcehub-border bg-amber-50 p-4 hover:border-amber-300"><p className="text-2xl font-bold text-amber-700">{lowDiskEndpoints}</p><p className="text-sm text-slate-600">Low disk space</p></Link>
            <Link href="/network/endpoints?bitLocker=disabled" className="rounded-2xl border border-sourcehub-border bg-red-50 p-4 hover:border-red-300"><p className="text-2xl font-bold text-red-700">{unencryptedEndpoints}</p><p className="text-sm text-slate-600">Without encryption</p></Link>
            <Link href="/network/endpoints?antivirus=disabled" className="rounded-2xl border border-sourcehub-border bg-red-50 p-4 hover:border-red-300"><p className="text-2xl font-bold text-red-700">{antivirusGaps}</p><p className="text-sm text-slate-600">Without active antivirus</p></Link>
            <Link href="/network/endpoints?firewall=disabled" className="rounded-2xl border border-sourcehub-border bg-red-50 p-4 hover:border-red-300"><p className="text-2xl font-bold text-red-700">{firewallGaps}</p><p className="text-sm text-slate-600">Firewall disabled</p></Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Open alerts</CardTitle></CardHeader>
          <CardContent className="p-0">
            {recentAlerts.length === 0 ? <div className="p-6"><EmptyState title="No open network alerts" description="New endpoint conditions will appear here after a trusted audit is received." /></div> : (
              <Table><TableHead><TableRow><TableHeadCell>Alert</TableHeadCell><TableHeadCell>Severity</TableHeadCell><TableHeadCell>Last detected</TableHeadCell></TableRow></TableHead><TableBody>
                {recentAlerts.map((alert) => <TableRow key={alert.id}><TableCell><Link href="/network/alerts" className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">{String(alert.type).replace(/_/g, " ")}</Link><p className="mt-1 max-w-md text-xs text-slate-500">{alert.description}</p></TableCell><TableCell><Badge tone={severityTone[alert.severity] ?? "info"}>{alertSeverityLabels[alert.severity as keyof typeof alertSeverityLabels] ?? alert.severity}</Badge></TableCell><TableCell>{formatDateTime(alert.lastDetectedAt)}</TableCell></TableRow>)}
              </TableBody></Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recently detected changes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {recentChanges.length === 0 ? <div className="p-6"><EmptyState title="No changes recorded" description="Important changes from endpoint audits will be recorded here." /></div> : (
            <Table><TableHead><TableRow><TableHeadCell>Change</TableHeadCell><TableHeadCell>Severity</TableHeadCell><TableHeadCell>Detected</TableHeadCell><TableHeadCell>Source audit</TableHeadCell></TableRow></TableHead><TableBody>
              {recentChanges.map((change) => <TableRow key={change.id}><TableCell className="font-medium">{String(change.changeType).replace(/_/g, " ")}</TableCell><TableCell><Badge tone={severityTone[change.severity] ?? "info"}>{change.severity}</Badge></TableCell><TableCell>{formatDateTime(change.detectedAt)}</TableCell><TableCell className="font-mono text-xs text-slate-500">{change.sourceAuditId ?? "Unavailable"}</TableCell></TableRow>)}
            </TableBody></Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 text-sm text-slate-500"><span>Health states: {Object.values(endpointHealthLabels).join(" / ")}</span><span>·</span><span>Compliance: {Object.values(endpointComplianceLabels).join(" / ")}</span><span>·</span><span>Environment monitoring: {Object.values(monitoringStateLabels).join(" / ")}</span><span>·</span><span><Clock3 className="mr-1 inline h-4 w-4" />Data updates after each trusted audit</span></div>
    </div>
  );
}
