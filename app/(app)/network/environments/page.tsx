import Link from "next/link";
import { Archive, Globe2, Plus } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { buttonClassName } from "@/lib/button";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { monitoringStateLabels, networkTypeLabels } from "@/lib/network";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

const stateTone: Record<string, "success" | "warning" | "danger" | "info" | "outline"> = { ACTIVE: "success", PAUSED: "warning", NOT_MONITORED: "outline", OFFLINE: "danger", ARCHIVED: "outline" };

export default async function NetworkEnvironmentsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("networks.view");
  const query = (await searchParams) ?? {};
  const search = String(query.search ?? "").trim();
  const clientId = String(query.clientId ?? "");
  const siteId = String(query.siteId ?? "");
  const monitoringState = String(query.monitoringState ?? "");
  const includeArchived = query.archived === "true";
  const cursor = String(query.cursor ?? "");
  const where = {
    workspaceId: env.DEFAULT_WORKSPACE_ID,
    ...(clientId ? { clientId } : {}),
    ...(siteId ? { siteId } : {}),
    ...(monitoringState ? { monitoringState } : {}),
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(search ? { searchTokens: { arrayContainsAny: search.toLowerCase().split(/[^a-z0-9]+/g).filter((item) => item.length >= 2).slice(0, 10) } } : {}),
  };
  const [clients, sites, environments] = await Promise.all([
    prisma.client.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: { not: "FORMER" } }, orderBy: { name: "asc" } }),
    prisma.clientSite.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } }),
    prisma.networkEnvironment.findMany({ where, orderBy: [{ updatedAt: "desc" }], ...(cursor ? { cursor: { id: cursor } } : {}), take: 26 }),
  ]);
  const rows = environments.slice(0, 25);
  const nextCursor = environments.length > 25 ? rows[rows.length - 1]?.id : null;
  const queryString = new URLSearchParams({ ...(search ? { search } : {}), ...(clientId ? { clientId } : {}), ...(siteId ? { siteId } : {}), ...(monitoringState ? { monitoringState } : {}), ...(includeArchived ? { archived: "true" } : {}) });
  const nextHref = nextCursor ? `/network/environments?${queryString.toString()}&cursor=${nextCursor}` : null;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Network Management" title="Network environments" description="Maintain client and site network scopes without mixing operational configuration into asset identity." actions={<Link href="/network/environments/new" className={buttonClassName({ variant: "primary" })}><Plus className="mr-2 h-4 w-4" />New environment</Link>} />
      <Card><CardHeader><CardTitle>Find an environment</CardTitle></CardHeader><CardContent><form method="get" className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr_auto]">
        <div><label className="text-sm font-medium">Search</label><Input name="search" defaultValue={search} placeholder="Name, subnet, ISP, domain" /></div>
        <div><label className="text-sm font-medium">Client</label><Select name="clientId" defaultValue={clientId}><option value="">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</Select></div>
        <div><label className="text-sm font-medium">Site</label><Select name="siteId" defaultValue={siteId}><option value="">All sites</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></div>
        <div><label className="text-sm font-medium">Monitoring</label><Select name="monitoringState" defaultValue={monitoringState}><option value="">All states</option>{Object.entries(monitoringStateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <div className="flex items-end gap-2"><button type="submit" className={buttonClassName({ variant: "secondary" })}>Apply</button><Link href="/network/environments" className={buttonClassName({ variant: "ghost" })}>Reset</Link></div>
        <label className="flex items-center gap-2 text-sm text-slate-600 lg:col-span-2"><input type="checkbox" name="archived" value="true" defaultChecked={includeArchived} /> Include archived environments</label>
      </form></CardContent></Card>
      <Card><CardContent className="p-0">{rows.length === 0 ? <div className="p-6"><EmptyState title="No network environments" description="Create a network environment to connect a client site to devices and endpoints." action={<Link href="/network/environments/new" className={buttonClassName({ variant: "primary" })}>New environment</Link>} /></div> : <Table><TableHead><TableRow><TableHeadCell>Environment</TableHeadCell><TableHeadCell>Client / site</TableHeadCell><TableHeadCell>Type</TableHeadCell><TableHeadCell>Monitoring</TableHeadCell><TableHeadCell>Last successful check</TableHeadCell><TableHeadCell>Actions</TableHeadCell></TableRow></TableHead><TableBody>{rows.map((environment) => <TableRow key={environment.id}><TableCell><Link href={`/network/environments/${environment.id}`} className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">{environment.name}</Link><p className="mt-1 text-xs text-slate-500">{environment.primarySubnet ?? "No primary subnet"}</p></TableCell><TableCell><p className="font-medium">{clients.find((client) => client.id === environment.clientId)?.name ?? "Unknown client"}</p><p className="text-xs text-slate-500">{sites.find((site) => site.id === environment.siteId)?.name ?? "Unknown site"}</p></TableCell><TableCell>{networkTypeLabels[environment.networkType as keyof typeof networkTypeLabels] ?? environment.networkType}</TableCell><TableCell><Badge tone={stateTone[environment.monitoringState] ?? "outline"}>{monitoringStateLabels[environment.monitoringState as keyof typeof monitoringStateLabels] ?? environment.monitoringState}</Badge></TableCell><TableCell>{formatDateTime(environment.lastSuccessfulCheck)}</TableCell><TableCell><Link href={`/network/environments/${environment.id}`} className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">View</Link></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
      <div className="flex items-center justify-between text-sm text-slate-500"><span><Globe2 className="mr-1 inline h-4 w-4" />Cursor-based results, 25 per page</span>{nextHref ? <Link href={nextHref} className={buttonClassName({ variant: "outline" })}>Next page</Link> : <span>End of results</span>}</div>
      {includeArchived ? <p className="text-xs text-slate-500"><Archive className="mr-1 inline h-3 w-3" />Archived environments are included in this view.</p> : null}
    </div>
  );
}
