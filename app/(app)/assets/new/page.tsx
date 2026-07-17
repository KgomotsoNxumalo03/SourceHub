import Link from "next/link";

import { createAssetAction } from "@/lib/actions/assets";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { builtInAssetTypes } from "@/lib/assets";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("assets.create");
  const query = (await searchParams) ?? {};
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

  const selectedAssetTypeId = String(query.assetTypeId ?? assetTypes[0]?.id ?? "");
  const selectedAssetType = assetTypes.find((assetType) => assetType.id === selectedAssetTypeId);
  const defaultCategory = selectedAssetType?.category ?? Object.values(builtInAssetTypes)[0]?.category ?? "Computer";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Asset Management"
        title="New asset"
        description="Register internal or client-owned equipment, assign ownership, and capture the core lifecycle data."
        actions={
          <Link href="/assets" className={buttonClassName({ variant: "outline" })}>
            Back to assets
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Asset details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAssetAction} className="space-y-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="assetTypeId">Asset type *</label>
                <Select id="assetTypeId" name="assetTypeId" defaultValue={selectedAssetTypeId} required>
                  {assetTypes.map((assetType) => (
                    <option key={assetType.id} value={assetType.id}>{assetType.name}</option>
                  ))}
                  {assetTypes.length === 0 ? <option value="">Create an asset type first</option> : null}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="category">Category *</label>
                <Input id="category" name="category" required defaultValue={defaultCategory} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="name">Asset name *</label>
                <Input id="name" name="name" required placeholder="Johannesburg finance laptop" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="status">Status *</label>
                <Select id="status" name="status" defaultValue="IN_STOCK">
                  <option value="ORDERED">Ordered</option>
                  <option value="IN_STOCK">In stock</option>
                  <option value="PREPARING">Preparing</option>
                  <option value="DEPLOYED">Deployed</option>
                  <option value="ACTIVE">Active</option>
                  <option value="UNDER_REPAIR">Under repair</option>
                  <option value="LOANED">Loaned</option>
                  <option value="IN_STORAGE">In storage</option>
                  <option value="LOST">Lost</option>
                  <option value="STOLEN">Stolen</option>
                  <option value="RETIRED">Retired</option>
                  <option value="DISPOSED">Disposed</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="ownershipType">Ownership *</label>
                <Select id="ownershipType" name="ownershipType" defaultValue="INTERNAL">
                  <option value="INTERNAL">Internal</option>
                  <option value="CLIENT">Client-owned</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="clientId">Client</label>
                <Select id="clientId" name="clientId" defaultValue="">
                  <option value="">Internal asset</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="siteId">Client site</label>
                <Select id="siteId" name="siteId" defaultValue="">
                  <option value="">No site</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name} - {site.clientId}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="contactId">Client contact</label>
                <Input id="contactId" name="contactId" placeholder="Contact ID" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="assignedUserId">Assigned user</label>
                <Select id="assignedUserId" name="assignedUserId" defaultValue="">
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="responsibleTechnicianId">Responsible technician</label>
                <Select id="responsibleTechnicianId" name="responsibleTechnicianId" defaultValue="">
                  <option value="">No technician</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="manufacturer">Manufacturer</label>
                <Input id="manufacturer" name="manufacturer" placeholder="Dell, Lenovo, HP..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="model">Model</label>
                <Input id="model" name="model" placeholder="Latitude 7440" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="serialNumber">Serial number</label>
                <Input id="serialNumber" name="serialNumber" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="hostname">Hostname</label>
                <Input id="hostname" name="hostname" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="ipAddress">IP address</label>
                <Input id="ipAddress" name="ipAddress" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="macAddress">MAC address</label>
                <Input id="macAddress" name="macAddress" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">Description</label>
                <Textarea id="description" name="description" placeholder="Physical description, deployed purpose, or useful notes." />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="internalNotes">Internal notes</label>
                <Textarea id="internalNotes" name="internalNotes" placeholder="Sensitive or operational context for the IT team." />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="cpu">CPU</label>
                <Input id="cpu" name="cpu" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="ram">RAM</label>
                <Input id="ram" name="ram" placeholder="16 GB" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="storageCapacity">Storage</label>
                <Input id="storageCapacity" name="storageCapacity" placeholder="512 GB SSD" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="storageType">Storage type</label>
                <Input id="storageType" name="storageType" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="operatingSystem">Operating system</label>
                <Input id="operatingSystem" name="operatingSystem" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="windowsVersion">Windows version</label>
                <Input id="windowsVersion" name="windowsVersion" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="architecture">Architecture</label>
                <Input id="architecture" name="architecture" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="biosVersion">BIOS version</label>
                <Input id="biosVersion" name="biosVersion" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="freeDiskSpaceGb">Free disk space GB</label>
                <Input id="freeDiskSpaceGb" name="freeDiskSpaceGb" type="number" step="0.1" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="supplier">Supplier</label>
                <Input id="supplier" name="supplier" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="purchaseDate">Purchase date</label>
                <Input id="purchaseDate" name="purchaseDate" type="date" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="purchasePrice">Purchase price</label>
                <Input id="purchasePrice" name="purchasePrice" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="currency">Currency</label>
                <Input id="currency" name="currency" defaultValue="ZAR" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="warrantyExpiryDate">Warranty expiry</label>
                <Input id="warrantyExpiryDate" name="warrantyExpiryDate" type="date" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="monitoringState">Monitoring</label>
                <Input id="monitoringState" name="monitoringState" placeholder="MONITORED" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="customFieldsJson">Custom fields JSON</label>
              <Textarea id="customFieldsJson" name="customFieldsJson" defaultValue="{}" placeholder='{"rack": "A-12", "imei": "123"}' />
              <p className="text-xs text-slate-500">Custom fields are validated as safe JSON objects and stored with the asset record.</p>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit">Create asset</Button>
              <Link href="/assets" className={buttonClassName({ variant: "ghost" })}>
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

