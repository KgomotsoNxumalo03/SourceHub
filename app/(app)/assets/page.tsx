import Link from "next/link";
import { Boxes, Clock3, Shuffle, ShieldAlert } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { buttonClassName } from "@/lib/button";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, PaginationShell, Select, StatCard, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";
import { assetHealthLabels, assetStatusLabels, calculateWarrantyStatus, warrantyStatusLabels } from "@/lib/assets";
import { formatDateTime } from "@/lib/utils";

const statusTone: Record<string, "success" | "warning" | "danger" | "info" | "outline"> = {
  ORDERED: "info",
  IN_STOCK: "outline",
  PREPARING: "warning",
  DEPLOYED: "info",
  ACTIVE: "success",
  UNDER_REPAIR: "warning",
  LOANED: "info",
  IN_STORAGE: "outline",
  LOST: "danger",
  STOLEN: "danger",
  RETIRED: "outline",
  DISPOSED: "outline",
  ARCHIVED: "outline",
};

export default async function AssetsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("assets.view");
  const query = (await searchParams) ?? {};
  const page = Math.max(1, Number(query.page ?? 1));
  const view = String(query.view ?? "table");
  const search = String(query.search ?? "").trim();
  const status = String(query.status ?? "");
  const assetTypeId = String(query.assetTypeId ?? "");
  const clientId = String(query.clientId ?? "");
  const assignedUserId = String(query.assignedUserId ?? "");
  const responsibleTechnicianId = String(query.responsibleTechnicianId ?? "");
  const manufacturer = String(query.manufacturer ?? "");
  const healthState = String(query.healthState ?? "");
  const complianceState = String(query.complianceState ?? "");

  const searchTokens = search
    ? search
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    : [];

  const where = {
    workspaceId: env.DEFAULT_WORKSPACE_ID,
    ...(status ? { status } : {}),
    ...(assetTypeId ? { assetTypeId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(assignedUserId ? { assignedUserId } : {}),
    ...(responsibleTechnicianId ? { responsibleTechnicianId } : {}),
    ...(manufacturer ? { manufacturer: { contains: manufacturer, mode: "insensitive" as const } } : {}),
    ...(healthState ? { healthState } : {}),
    ...(complianceState ? { complianceState } : {}),
    ...(searchTokens.length > 0 ? { searchTokens: { arrayContainsAny: searchTokens.slice(0, 10) } } : {}),
  };

  const [assetTypes, clients, users, total, activeAssets, underRepair, unassigned, expiringWarranty, assets] = await Promise.all([
    prisma.assetType.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
    prisma.asset.count({ where }),
    prisma.asset.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: { in: ["ACTIVE", "DEPLOYED", "LOANED"] as const } } }),
    prisma.asset.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, status: "UNDER_REPAIR" } }),
    prisma.asset.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, assignedUserId: null, status: { in: ["ACTIVE", "DEPLOYED", "IN_STORAGE", "UNDER_REPAIR"] as const } } }),
    prisma.asset.count({
      where: {
        workspaceId: env.DEFAULT_WORKSPACE_ID,
        warrantyExpiryDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.asset.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * 12,
      take: 12,
      include: {
        assetType: true,
        client: true,
        site: true,
        assignedUser: { select: { firstName: true, lastName: true, email: true } },
        responsibleTechnician: { select: { firstName: true, lastName: true, email: true } },
        healthSnapshots: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / 12));
  const queryParts = new URLSearchParams();
  if (search) queryParts.set("search", search);
  if (status) queryParts.set("status", status);
  if (assetTypeId) queryParts.set("assetTypeId", assetTypeId);
  if (clientId) queryParts.set("clientId", clientId);
  if (assignedUserId) queryParts.set("assignedUserId", assignedUserId);
  if (responsibleTechnicianId) queryParts.set("responsibleTechnicianId", responsibleTechnicianId);
  if (manufacturer) queryParts.set("manufacturer", manufacturer);
  if (healthState) queryParts.set("healthState", healthState);
  if (complianceState) queryParts.set("complianceState", complianceState);
  const queryString = queryParts.toString();
  const tableHref = `/assets${queryString ? `?${queryString}&view=table` : "?view=table"}`;
  const gridHref = `/assets${queryString ? `?${queryString}&view=grid` : "?view=grid"}`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Asset Management"
        title="Assets"
        description="Track hardware, software, licences, and warranty lifecycle information in one workspace."
        actions={
          <div className="flex items-center gap-3">
            <Link href="/assets/import" className={buttonClassName({ variant: "outline" })}>
              Import CSV
            </Link>
            <Link href="/assets/new" className={buttonClassName({ variant: "primary" })}>
              New asset
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active assets" value={activeAssets.toLocaleString()} hint="Deployed, active, or loaned assets." icon={<Boxes className="h-5 w-5" />} />
        <StatCard label="Under repair" value={underRepair.toLocaleString()} hint="Assets currently in repair or maintenance." icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Unassigned" value={unassigned.toLocaleString()} hint="Assets without an assigned user." icon={<Shuffle className="h-5 w-5" />} />
        <StatCard label="Warranty expiring" value={expiringWarranty.toLocaleString()} hint="Expiring in the next 45 days." icon={<ShieldAlert className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Filters</CardTitle>
            <p className="mt-1 text-sm text-slate-600">Search by tag, serial number, hostname, user, client, or site.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={tableHref} className={buttonClassName({ variant: view === "table" ? "primary" : "outline", size: "sm" })}>
              Table
            </Link>
            <Link href={gridHref} className={buttonClassName({ variant: view === "grid" ? "primary" : "outline", size: "sm" })}>
              Grid
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <input type="hidden" name="view" value={view} />
            <div className="space-y-2 xl:col-span-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="search">Search</label>
              <Input id="search" name="search" defaultValue={search} placeholder="Tag, name, serial, hostname..." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="status">Status</label>
              <Select id="status" name="status" defaultValue={status}>
                <option value="">All statuses</option>
                {Object.entries(assetStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="assetTypeId">Type</label>
              <Select id="assetTypeId" name="assetTypeId" defaultValue={assetTypeId}>
                <option value="">All types</option>
                {assetTypes.map((assetType) => (
                  <option key={assetType.id} value={assetType.id}>{assetType.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="clientId">Client</label>
              <Select id="clientId" name="clientId" defaultValue={clientId}>
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="assignedUserId">Assigned user</label>
              <Select id="assignedUserId" name="assignedUserId" defaultValue={assignedUserId}>
                <option value="">Any user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="responsibleTechnicianId">Technician</label>
              <Select id="responsibleTechnicianId" name="responsibleTechnicianId" defaultValue={responsibleTechnicianId}>
                <option value="">Any technician</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="manufacturer">Manufacturer</label>
              <Input id="manufacturer" name="manufacturer" defaultValue={manufacturer} placeholder="Dell, HP, Lenovo..." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="healthState">Health</label>
              <Select id="healthState" name="healthState" defaultValue={healthState}>
                <option value="">All health states</option>
                {Object.entries(assetHealthLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="complianceState">Compliance</label>
              <Select id="complianceState" name="complianceState" defaultValue={complianceState}>
                <option value="">All states</option>
                <option value="COMPLIANT">Compliant</option>
                <option value="AT_RISK">At risk</option>
                <option value="NON_COMPLIANT">Non-compliant</option>
                <option value="UNKNOWN">Unknown</option>
              </Select>
            </div>
            <div className="flex items-end gap-2 xl:col-span-2">
              <button type="submit" className={buttonClassName({ variant: "secondary", className: "w-full" })}>Apply</button>
              <Link href="/assets" className={buttonClassName({ variant: "ghost" })}>Reset</Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {assets.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No assets found" description="Create assets or adjust filters to see inventory." action={<Link href="/assets/new" className={buttonClassName({ variant: "primary" })}>New asset</Link>} />
            </div>
          ) : view === "grid" ? (
            <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => {
                const warrantyState = calculateWarrantyStatus({ expiryDate: asset.warrantyExpiryDate ?? null });
                const currentHealth = asset.healthSnapshots?.[0]?.healthState ?? asset.healthState ?? "UNKNOWN";
                return (
                  <Card key={asset.id} className="border-sourcehub-border/80">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/assets/${asset.id}`} className="text-base font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">
                            {asset.assetTag}
                          </Link>
                          <p className="text-sm text-sourcehub-text">{asset.name}</p>
                        </div>
                        <Badge tone={statusTone[asset.status] ?? "outline"}>{assetStatusLabels[asset.status as keyof typeof assetStatusLabels] ?? asset.status}</Badge>
                      </div>
                      <p className="text-sm text-slate-600">{asset.assetType?.name ?? "Asset type not set"}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="outline">{currentHealth}</Badge>
                        <Badge tone={warrantyState === "ACTIVE" ? "success" : warrantyState === "EXPIRING_SOON" ? "warning" : warrantyState === "EXPIRED" ? "danger" : "outline"}>{warrantyStatusLabels[warrantyState]}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{asset.client?.name ?? "No client"} {asset.site?.name ? `· ${asset.site.name}` : ""}</p>
                      <p className="text-xs text-slate-500">Updated {formatDateTime(asset.updatedAt)}</p>
                      <Link href={`/assets/${asset.id}`} className={buttonClassName({ variant: "outline", className: "w-full" })}>View asset</Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Asset</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Client</TableHeadCell>
                  <TableHeadCell>Assignment</TableHeadCell>
                  <TableHeadCell>Warranty</TableHeadCell>
                  <TableHeadCell>Updated</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assets.map((asset) => {
                  const warrantyState = calculateWarrantyStatus({ expiryDate: asset.warrantyExpiryDate ?? null });
                  const currentHealth = asset.healthSnapshots?.[0]?.healthState ?? asset.healthState ?? "UNKNOWN";
                  return (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <Link href={`/assets/${asset.id}`} className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">{asset.assetTag}</Link>
                        <p className="mt-1 text-sm text-sourcehub-text">{asset.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{asset.assetType?.name ?? "Uncategorised"} · {asset.manufacturer ?? "No manufacturer"} · {asset.model ?? "No model"}</p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge tone={statusTone[asset.status] ?? "outline"}>{assetStatusLabels[asset.status as keyof typeof assetStatusLabels] ?? asset.status}</Badge>
                          <p className="text-xs text-slate-500">{currentHealth}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sourcehub-text">{asset.client?.name ?? "Internal"}</p>
                        <p className="text-xs text-slate-500">{asset.site?.name ?? "No site"}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sourcehub-text">{asset.assignedUser ? `${asset.assignedUser.firstName} ${asset.assignedUser.lastName}` : "Unassigned"}</p>
                        <p className="text-xs text-slate-500">{asset.responsibleTechnician ? `${asset.responsibleTechnician.firstName} ${asset.responsibleTechnician.lastName}` : "No technician"}</p>
                      </TableCell>
                      <TableCell>
                        <Badge tone={warrantyState === "ACTIVE" ? "success" : warrantyState === "EXPIRING_SOON" ? "warning" : warrantyState === "EXPIRED" ? "danger" : "outline"}>
                          {warrantyStatusLabels[warrantyState]}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(asset.updatedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaginationShell page={page} totalPages={totalPages} basePath="/assets" query={queryString} />
    </div>
  );
}
