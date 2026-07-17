import Link from "next/link";

import { createAssetTypeAction } from "@/lib/actions/assets";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { builtInAssetTypes } from "@/lib/assets";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default async function NewAssetTypePage() {
  await requirePermission("assetTypes.manage");

  const defaultType = Object.values(builtInAssetTypes)[0];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Asset Management"
        title="New asset type"
        description="Define a reusable asset type with required fields and custom field metadata."
        actions={
          <Link href="/administration/asset-types" className={buttonClassName({ variant: "outline" })}>
            Back to asset types
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Type configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAssetTypeAction} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="name">Name *</label>
                <Input id="name" name="name" required defaultValue={defaultType.name} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="prefix">Tag prefix *</label>
                <Input id="prefix" name="prefix" required defaultValue={defaultType.prefix} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="icon">Icon *</label>
                <Input id="icon" name="icon" required defaultValue={defaultType.icon} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="category">Category *</label>
                <Input id="category" name="category" required defaultValue={defaultType.category} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="description">Description</label>
              <Textarea id="description" name="description" defaultValue={defaultType.description} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="requiredFields">Required fields</label>
              <Textarea id="requiredFields" name="requiredFields" defaultValue={defaultType.requiredFields.join("\n")} placeholder="manufacturer\nmodel\nserialNumber" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="customFieldsJson">Custom fields JSON</label>
              <Textarea id="customFieldsJson" name="customFieldsJson" defaultValue={JSON.stringify(defaultType.customFields, null, 2)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="active">Status</label>
              <Select id="active" name="active" defaultValue="true">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit">Create type</Button>
              <Link href="/administration/asset-types" className={buttonClassName({ variant: "ghost" })}>
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

