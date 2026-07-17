import Link from "next/link";
import QRCode from "qrcode";

import { createAssetMaintenanceAction, createAssetSoftwareAction, createAssetWarrantyAction, assignAssetAction, changeAssetStatusAction, returnAssetAction, updateAssetAction, uploadAssetFileAction } from "@/lib/actions/assets";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hasPermission, type CurrentUser } from "@/lib/permissions";
import { assetComplianceLabels, assetHealthLabels, assetOwnershipLabels, assetStatusLabels, calculateWarrantyStatus, maintenanceTypeLabels, warrantyStatusLabels } from "@/lib/assets";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow, Textarea } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";

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

function canSeeAction(user: CurrentUser | null, permission: string) {
  return hasPermission(user, permission);
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePermission("assets.view");
  const { id } = await params;

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      assetType: true,
      client: true,
      site: true,
      assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      responsibleTechnician: { select: { id: true, firstName: true, lastName: true, email: true } },
      assignments: true,
      maintenance: true,
      assetWarranties: true,
      files: true,
      events: {
        include: {
          actor: { select: { firstName: true, lastName: true, email: true } },
        },
      },
      software: true,
      healthSnapshots: true,
      tickets: true,
    },
  });

  if (!asset) {
    return (
      <EmptyState
        title="Asset not found"
        description="The selected asset no longer exists or you no longer have access to it."
        action={
          <Link href="/assets" className={buttonClassName({ variant: "primary" })}>
            Back to assets
          </Link>
        }
      />
    );
  }

  const assetTypes = await prisma.assetType.findMany({
    where: { workspaceId: env.DEFAULT_WORKSPACE_ID },
    orderBy: { name: "asc" },
  });
  const clients = await prisma.client.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } });
  const sites = await prisma.clientSite.findMany({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID }, orderBy: { name: "asc" } });
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  });
  const licences = await prisma.softwareLicence.findMany({
    where: { workspaceId: env.DEFAULT_WORKSPACE_ID, ...(asset.clientId ? { clientId: asset.clientId } : {}) },
    orderBy: [{ updatedAt: "desc" }],
  });
  const qrDataUrl = await QRCode.toDataURL(asset.qrCodeValue || `${env.NEXT_PUBLIC_APP_URL}/assets/${asset.id}`, { width: 220, margin: 1 });
  const latestWarranty = asset.assetWarranties?.[0] ?? null;
  const warrantyState = calculateWarrantyStatus({ expiryDate: latestWarranty?.expiryDate ?? asset.warrantyExpiryDate ?? null });
  const healthState = asset.healthSnapshots?.[0]?.healthState ?? asset.healthState ?? "UNKNOWN";
  const complianceState = asset.healthSnapshots?.[0]?.complianceState ?? asset.complianceState ?? "UNKNOWN";
  const openTickets = asset.tickets?.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)) ?? [];
  const recentEvents = asset.events?.slice(0, 10) ?? [];

  const canUpdate = canSeeAction(actor, "assets.update");
  const canAssign = canSeeAction(actor, "assets.assign");
  const canMaintain = canSeeAction(actor, "asset_maintenance.manage");
  const canFiles = canSeeAction(actor, "asset_files.manage");
  const canSoftware = canSeeAction(actor, "asset_software.manage");
  const canWarranty = canSeeAction(actor, "assets.update");
  const canLicense = canSeeAction(actor, "asset_licences.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Asset Management"
        title={asset.assetTag}
        description={asset.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/assets" className={buttonClassName({ variant: "outline" })}>
              Back to assets
            </Link>
            <Link href={`/tickets/new?assetId=${asset.id}`} className={buttonClassName({ variant: "secondary" })}>
              Create ticket
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <Badge tone={statusTone[asset.status] ?? "outline"}>{assetStatusLabels[asset.status as keyof typeof assetStatusLabels] ?? asset.status}</Badge>
            <p className="text-sm text-slate-600">{asset.assetType?.name ?? "Asset type not set"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Health</p>
            <Badge tone={healthState === "HEALTHY" ? "success" : healthState === "MONITOR" ? "warning" : healthState === "AT_RISK" ? "danger" : "outline"}>
              {assetHealthLabels[healthState as keyof typeof assetHealthLabels] ?? healthState}
            </Badge>
            <p className="text-sm text-slate-600">{asset.healthSnapshots?.[0]?.calculatedAt ? `Calculated ${formatDateTime(asset.healthSnapshots[0].calculatedAt)}` : "Not yet calculated"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Compliance</p>
            <Badge tone={complianceState === "COMPLIANT" ? "success" : complianceState === "AT_RISK" ? "warning" : complianceState === "NON_COMPLIANT" ? "danger" : "outline"}>
              {assetComplianceLabels[complianceState as keyof typeof assetComplianceLabels] ?? complianceState}
            </Badge>
            <p className="text-sm text-slate-600">{asset.assignedUser ? `${asset.assignedUser.firstName} ${asset.assignedUser.lastName}` : "No assigned user"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Warranty</p>
            <Badge tone={warrantyState === "ACTIVE" ? "success" : warrantyState === "EXPIRING_SOON" ? "warning" : warrantyState === "EXPIRED" ? "danger" : "outline"}>
              {warrantyStatusLabels[warrantyState]}
            </Badge>
            <p className="text-sm text-slate-600">{asset.assetWarranties?.[0]?.expiryDate ? `Expires ${formatDate(asset.assetWarranties[0].expiryDate)}` : "No warranty date"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Client</p>
                <p className="mt-1 font-medium text-sourcehub-text">{asset.client?.name ?? "Internal"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Site</p>
                <p className="mt-1 font-medium text-sourcehub-text">{asset.site?.name ?? "No site"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Assigned user</p>
                <p className="mt-1 font-medium text-sourcehub-text">{asset.assignedUser ? `${asset.assignedUser.firstName} ${asset.assignedUser.lastName}` : "Unassigned"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Responsible technician</p>
                <p className="mt-1 font-medium text-sourcehub-text">{asset.responsibleTechnician ? `${asset.responsibleTechnician.firstName} ${asset.responsibleTechnician.lastName}` : "Not set"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Manufacturer / model</p>
                <p className="mt-1 font-medium text-sourcehub-text">{asset.manufacturer ?? "Unknown"} {asset.model ? `· ${asset.model}` : ""}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Serial number</p>
                <p className="mt-1 font-medium text-sourcehub-text">{asset.serialNumber ?? "Not captured"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Ownership</p>
                <p className="mt-1 font-medium text-sourcehub-text">{assetOwnershipLabels[asset.ownershipType as keyof typeof assetOwnershipLabels] ?? asset.ownershipType}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Last check-in</p>
                <p className="mt-1 font-medium text-sourcehub-text">{asset.lastCheckIn ? formatDateTime(asset.lastCheckIn) : "No check-in yet"}</p>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Description</p>
              <p className="mt-2 text-sm text-sourcehub-text">{asset.description ?? "No description captured."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="#edit-asset" className={buttonClassName({ variant: "outline", size: "sm" })}>Edit asset</a>
              {canAssign ? <a href="#assignment" className={buttonClassName({ variant: "outline", size: "sm" })}>Assign asset</a> : null}
              {canMaintain ? <a href="#maintenance" className={buttonClassName({ variant: "outline", size: "sm" })}>Add maintenance</a> : null}
              {canFiles ? <a href="#files" className={buttonClassName({ variant: "outline", size: "sm" })}>Upload document</a> : null}
              <a href="#label" className={buttonClassName({ variant: "outline", size: "sm" })}>Print label</a>
            </div>
          </CardContent>
        </Card>

        <Card id="label">
          <CardHeader>
            <CardTitle>QR label</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <img src={qrDataUrl} alt="Asset QR code" className="h-48 w-48 rounded-2xl border border-sourcehub-border bg-white p-3" />
            <div className="rounded-2xl border border-sourcehub-border bg-sourcehub-muted/40 p-4">
              <p className="text-sm font-semibold text-sourcehub-text">{asset.assetTag}</p>
              <p className="text-sm text-slate-600">{asset.name}</p>
              <p className="text-xs text-slate-500">{asset.serialNumber ?? "No serial number"}</p>
              <p className="mt-2 text-xs text-slate-500">QR opens the authorised asset page only.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card id="edit-asset">
          <CardHeader>
            <CardTitle>Edit asset</CardTitle>
          </CardHeader>
          <CardContent>
            {canUpdate ? (
              <form action={updateAssetAction} className="space-y-4">
                <input type="hidden" name="id" value={asset.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="assetTypeId">Asset type</label>
                    <Select id="assetTypeId" name="assetTypeId" defaultValue={asset.assetTypeId}>
                      {assetTypes.map((assetType) => (
                        <option key={assetType.id} value={assetType.id}>{assetType.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="category">Category</label>
                    <Input id="category" name="category" defaultValue={asset.category} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="name">Asset name</label>
                    <Input id="name" name="name" defaultValue={asset.name} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="status">Status</label>
                    <Select id="status" name="status" defaultValue={asset.status}>
                      {Object.entries(assetStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="ownershipType">Ownership</label>
                    <Select id="ownershipType" name="ownershipType" defaultValue={asset.ownershipType}>
                      {Object.entries(assetOwnershipLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="clientId">Client</label>
                    <Select id="clientId" name="clientId" defaultValue={asset.clientId ?? ""}>
                      <option value="">No client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="siteId">Site</label>
                    <Select id="siteId" name="siteId" defaultValue={asset.siteId ?? ""}>
                      <option value="">No site</option>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="assignedUserId">Assigned user</label>
                    <Select id="assignedUserId" name="assignedUserId" defaultValue={asset.assignedUserId ?? ""}>
                      <option value="">Unassigned</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="responsibleTechnicianId">Technician</label>
                    <Select id="responsibleTechnicianId" name="responsibleTechnicianId" defaultValue={asset.responsibleTechnicianId ?? ""}>
                      <option value="">No technician</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">Description</label>
                    <Textarea id="description" name="description" defaultValue={asset.description ?? ""} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="customFieldsJson">Custom fields JSON</label>
                  <Textarea id="customFieldsJson" name="customFieldsJson" defaultValue={JSON.stringify(asset.customFields ?? {}, null, 2)} />
                </div>
                <Button type="submit">Save changes</Button>
              </form>
            ) : (
              <p className="text-sm text-slate-600">You do not have permission to update assets.</p>
            )}
          </CardContent>
        </Card>

        <Card id="assignment">
          <CardHeader>
            <CardTitle>Assignment and transfer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {canAssign ? (
              <>
                <form action={assignAssetAction} className="space-y-4">
                  <input type="hidden" name="assetId" value={asset.id} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-sourcehub-text" htmlFor="assignmentType">Assignment target</label>
                      <Select id="assignmentType" name="assignmentType" defaultValue="USER">
                        <option value="USER">User</option>
                        <option value="CLIENT">Client</option>
                        <option value="SITE">Site</option>
                        <option value="CONTACT">Contact</option>
                        <option value="DEPARTMENT">Department</option>
                        <option value="STORAGE">Storage location</option>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-sourcehub-text" htmlFor="targetId">Target ID</label>
                      <Input id="targetId" name="targetId" placeholder="User, client, site, or location identifier" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="notes">Assignment notes</label>
                    <Textarea id="notes" name="notes" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="transferNotes">Transfer notes</label>
                    <Textarea id="transferNotes" name="transferNotes" />
                  </div>
                  <Button type="submit">Save assignment</Button>
                </form>
                <form action={returnAssetAction} className="space-y-4 rounded-2xl border border-sourcehub-border bg-sourcehub-muted/30 p-4">
                  <input type="hidden" name="assetId" value={asset.id} />
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="returnNotes">Return notes</label>
                    <Textarea id="returnNotes" name="notes" />
                  </div>
                  <Button type="submit" variant="secondary">Return to storage</Button>
                </form>
              </>
            ) : (
              <p className="text-sm text-slate-600">You do not have permission to assign or transfer assets.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lifecycle status</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={changeAssetStatusAction} className="space-y-4">
              <input type="hidden" name="assetId" value={asset.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="statusChange">New status</label>
                  <Select id="statusChange" name="status" defaultValue={asset.status}>
                    {Object.entries(assetStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="reason">Reason</label>
                  <Input id="reason" name="reason" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="statusNotes">Notes</label>
                <Textarea id="statusNotes" name="notes" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="disposalMethod">Disposal method</label>
                  <Input id="disposalMethod" name="disposalMethod" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="disposalCertificate">Disposal certificate</label>
                  <Input id="disposalCertificate" name="disposalCertificate" />
                </div>
              </div>
              <Button type="submit">Update status</Button>
            </form>
          </CardContent>
        </Card>

        <Card id="maintenance">
          <CardHeader>
            <CardTitle>Maintenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {canMaintain ? (
              <form action={createAssetMaintenanceAction} className="space-y-4">
                <input type="hidden" name="assetId" value={asset.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="maintenanceType">Type</label>
                    <Select id="maintenanceType" name="maintenanceType" defaultValue="INSPECTION">
                      {Object.entries(maintenanceTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="technicianId">Technician</label>
                    <Select id="technicianId" name="technicianId" defaultValue="">
                      <option value="">No technician</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="maintenanceDescription">Description</label>
                    <Textarea id="maintenanceDescription" name="description" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="startDate">Start date</label>
                    <Input id="startDate" name="startDate" type="date" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="completionDate">Completion date</label>
                    <Input id="completionDate" name="completionDate" type="date" />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="cost">Cost</label>
                    <Input id="cost" name="cost" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="currency">Currency</label>
                    <Input id="currency" name="currency" defaultValue="ZAR" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="downtimeMinutes">Downtime minutes</label>
                    <Input id="downtimeMinutes" name="downtimeMinutes" type="number" defaultValue={0} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="partsReplaced">Parts replaced</label>
                  <Textarea id="partsReplaced" name="partsReplaced" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="outcome">Outcome</label>
                  <Input id="outcome" name="outcome" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="nextServiceDate">Next service date</label>
                  <Input id="nextServiceDate" name="nextServiceDate" type="date" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="maintenanceNotes">Notes</label>
                  <Textarea id="maintenanceNotes" name="notes" />
                </div>
                <Button type="submit">Add maintenance record</Button>
              </form>
            ) : (
              <p className="text-sm text-slate-600">You do not have permission to create maintenance records.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Warranties and licences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {canWarranty ? (
              <form action={createAssetWarrantyAction} className="space-y-4">
                <input type="hidden" name="assetId" value={asset.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="provider">Warranty provider</label>
                    <Input id="provider" name="provider" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="reference">Reference</label>
                    <Input id="reference" name="reference" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="startDate">Start date</label>
                    <Input id="startDate" name="startDate" type="date" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="expiryDate">Expiry date</label>
                    <Input id="expiryDate" name="expiryDate" type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="coverageDetails">Coverage details</label>
                  <Textarea id="coverageDetails" name="coverageDetails" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="contactInfo">Contact information</label>
                  <Input id="contactInfo" name="contactInfo" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="claimHistory">Claim history</label>
                  <Textarea id="claimHistory" name="claimHistory" />
                </div>
                <Button type="submit">Update warranty</Button>
              </form>
            ) : null}

            {canLicense ? (
              <form action={createAssetSoftwareAction} className="space-y-4 rounded-2xl border border-sourcehub-border bg-sourcehub-muted/30 p-4">
                <input type="hidden" name="assetId" value={asset.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="softwareName">Software name</label>
                    <Input id="softwareName" name="softwareName" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="publisher">Publisher</label>
                    <Input id="publisher" name="publisher" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="version">Version</label>
                    <Input id="version" name="version" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="installationDate">Install date</label>
                    <Input id="installationDate" name="installationDate" type="date" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="installationSource">Installation source</label>
                  <Input id="installationSource" name="installationSource" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="licenceId">Licence ID</label>
                  <Input id="licenceId" name="licenceId" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="detectionSource">Detection source</label>
                  <Input id="detectionSource" name="detectionSource" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="securityRiskState">Security risk</label>
                  <Input id="securityRiskState" name="securityRiskState" />
                </div>
                <Button type="submit">Add software inventory</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card id="files">
          <CardHeader>
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canFiles ? (
              <form action={uploadAssetFileAction} encType="multipart/form-data" className="space-y-4">
                <input type="hidden" name="assetId" value={asset.id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="category">Category</label>
                    <Select id="category" name="category" defaultValue="other">
                      <option value="purchase">Purchase</option>
                      <option value="warranty">Warranty</option>
                      <option value="disposal">Disposal</option>
                      <option value="photo">Photo</option>
                      <option value="repair">Repair</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="supplier">Supplier</option>
                      <option value="other">Other</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-sourcehub-text" htmlFor="file">Upload file</label>
                    <Input id="file" name="file" type="file" className="py-2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">Description</label>
                  <Textarea id="description" name="description" />
                </div>
                <Button type="submit">Upload document</Button>
              </form>
            ) : null}

            <div className="space-y-2">
              {asset.files.length === 0 ? (
                <EmptyState title="No files" description="Upload purchase, warranty, repair, or disposal documents here." />
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>File</TableHeadCell>
                      <TableHeadCell>Category</TableHeadCell>
                      <TableHeadCell>Size</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {asset.files.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell>
                          <a href={file.downloadUrl} className="font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
                            {file.originalName}
                          </a>
                          <p className="text-xs text-slate-500">{file.description ?? "No description"}</p>
                        </TableCell>
                        <TableCell>{file.category}</TableCell>
                        <TableCell>{Math.round((file.fileSize ?? 0) / 1024)} KB</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tickets and activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Open tickets</p>
              {openTickets.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No open tickets are linked to this asset.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {openTickets.map((ticket) => (
                    <li key={ticket.id} className="rounded-2xl border border-sourcehub-border p-3">
                      <Link href={`/tickets/${ticket.id}`} className="font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
                        {ticket.referenceNumber}
                      </Link>
                      <p className="text-sm text-sourcehub-text">{ticket.subject}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Recent events</p>
              {recentEvents.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No asset history yet.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {recentEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-sourcehub-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-sourcehub-text">{event.eventType}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</p>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{event.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lifecycle history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {asset.assignments.length === 0 ? (
              <EmptyState title="No assignments" description="Assignment changes will appear here over time." />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Assigned</TableHeadCell>
                    <TableHeadCell>Type</TableHeadCell>
                    <TableHeadCell>Notes</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {asset.assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>{formatDateTime(assignment.assignedAt)}</TableCell>
                      <TableCell>{assignment.assignmentType}</TableCell>
                      <TableCell>{assignment.notes ?? assignment.transferNotes ?? "No notes"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
