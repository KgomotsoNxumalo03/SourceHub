import Link from "next/link";

import { toggleAssetTypeAction } from "@/lib/actions/assets";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Badge, Card, CardContent, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeadCell, TableRow } from "@/components/ui";

export default async function AssetTypesPage() {
  await requirePermission("assetTypes.manage");

  const assetTypes = await prisma.assetType.findMany({
    where: { workspaceId: env.DEFAULT_WORKSPACE_ID },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Asset Management"
        title="Asset types"
        description="Configure the asset taxonomy, required fields, and custom field definitions used across the module."
        actions={
          <Link href="/administration/asset-types/new" className={buttonClassName({ variant: "primary" })}>
            New type
          </Link>
        }
      />

      <Card>
        <CardContent className="p-0">
          {assetTypes.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No asset types yet"
                description="Create the first asset type to start registering inventory."
                action={
                  <Link href="/administration/asset-types/new" className={buttonClassName({ variant: "primary" })}>
                    New type
                  </Link>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Type</TableHeadCell>
                  <TableHeadCell>Category</TableHeadCell>
                  <TableHeadCell>Prefix</TableHeadCell>
                  <TableHeadCell>Required fields</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell>Actions</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assetTypes.map((assetType) => (
                  <TableRow key={assetType.id}>
                    <TableCell>
                      <Link href={`/administration/asset-types/${assetType.id}`} className="font-semibold text-sourcehub-primary hover:text-sourcehub-secondary">
                        {assetType.name}
                      </Link>
                      <p className="mt-1 text-sm text-slate-600">{assetType.description ?? "No description"}</p>
                    </TableCell>
                    <TableCell>{assetType.category}</TableCell>
                    <TableCell>{assetType.prefix}</TableCell>
                    <TableCell>{(assetType.requiredFields ?? []).length}</TableCell>
                    <TableCell>
                      <Badge tone={assetType.active ? "success" : "outline"}>{assetType.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell>
                      <form action={toggleAssetTypeAction}>
                        <input type="hidden" name="id" value={assetType.id} />
                        <input type="hidden" name="active" value={String(!assetType.active)} />
                        <button type="submit" className="text-sm font-medium text-sourcehub-primary hover:text-sourcehub-secondary">
                          {assetType.active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

