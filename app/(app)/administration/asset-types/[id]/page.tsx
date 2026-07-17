import Link from "next/link";

import { updateAssetTypeAction, toggleAssetTypeAction } from "@/lib/actions/assets";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default async function AssetTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("assetTypes.manage");
  const { id } = await params;
  const assetType = await prisma.assetType.findUnique({
    where: { id },
  });

  if (!assetType) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Asset Management" title="Asset type not found" />
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-slate-600">The selected asset type no longer exists.</p>
            <div className="mt-4">
              <Link href="/administration/asset-types" className={buttonClassName({ variant: "outline" })}>
                Back to asset types
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const usageCount = await prisma.asset.count({ where: { workspaceId: env.DEFAULT_WORKSPACE_ID, assetTypeId: assetType.id } });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Asset Management"
        title={assetType.name}
        description={assetType.description ?? "Asset type configuration"}
        actions={
          <Link href="/administration/asset-types" className={buttonClassName({ variant: "outline" })}>
            Back to asset types
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Prefix</p>
            <p className="text-2xl font-bold text-sourcehub-text">{assetType.prefix}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
            <p className="text-2xl font-bold text-sourcehub-text">{assetType.category}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Required fields</p>
            <p className="text-2xl font-bold text-sourcehub-text">{(assetType.requiredFields ?? []).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Assets using this type</p>
            <p className="text-2xl font-bold text-sourcehub-text">{usageCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit type</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateAssetTypeAction} className="space-y-6">
            <input type="hidden" name="id" value={assetType.id} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="name">Name</label>
                <Input id="name" name="name" defaultValue={assetType.name} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="prefix">Prefix</label>
                <Input id="prefix" name="prefix" defaultValue={assetType.prefix} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="icon">Icon</label>
                <Input id="icon" name="icon" defaultValue={assetType.icon} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="category">Category</label>
                <Input id="category" name="category" defaultValue={assetType.category} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">Description</label>
              <Textarea id="description" name="description" defaultValue={assetType.description ?? ""} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="requiredFields">Required fields</label>
              <Textarea id="requiredFields" name="requiredFields" defaultValue={(assetType.requiredFields ?? []).join("\n")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="customFieldsJson">Custom fields JSON</label>
              <Textarea id="customFieldsJson" name="customFieldsJson" defaultValue={JSON.stringify(assetType.customFields ?? [], null, 2)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="active">Status</label>
              <Select id="active" name="active" defaultValue={String(assetType.active)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
          <form action={toggleAssetTypeAction} className="mt-4">
            <input type="hidden" name="id" value={assetType.id} />
            <input type="hidden" name="active" value={String(!assetType.active)} />
            <button type="submit" className={buttonClassName({ variant: "outline" })}>
              {assetType.active ? "Deactivate" : "Activate"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
