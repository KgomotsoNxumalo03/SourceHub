import Link from "next/link";
import { randomUUID } from "node:crypto";

import { importAssetsAction } from "@/lib/actions/assets";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader, Textarea } from "@/components/ui";

export default async function AssetImportPage() {
  await requirePermission("assets.import");

  const importKey = randomUUID();
  const sampleCsv = [
    "assetTypeId,assetTag,name,status,ownershipType,serialNumber,manufacturer,model",
    "laptop,,Finance laptop,IN_STOCK,INTERNAL,ABC123,Dell,Latitude 7440",
    "desktop,,Reception desktop,ACTIVE,CLIENT,XYZ987,HP,EliteDesk 800",
  ].join("\n");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Asset Management"
        title="Import assets"
        description="Paste CSV data or upload a prepared file through the same server-side import pipeline."
        actions={
          <Link href="/assets" className={buttonClassName({ variant: "outline" })}>
            Back to assets
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>CSV import</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={importAssetsAction} className="space-y-6">
            <input type="hidden" name="importKey" value={importKey} />
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="csvContent">CSV content</label>
              <Textarea id="csvContent" name="csvContent" defaultValue={sampleCsv} rows={12} />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit">Run import</Button>
              <Link href="/assets" className={buttonClassName({ variant: "ghost" })}>Cancel</Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-2xl bg-sourcehub-muted p-4 text-xs text-sourcehub-text">
{`assetTypeId,assetTag,name,status,ownershipType,serialNumber,manufacturer,model,clientId,siteId,assignedUserId,responsibleTechnicianId,category
laptop,SIT-LAP-00001,Finance laptop,ACTIVE,INTERNAL,ABC123,Dell,Latitude 7440,,,user-id-123,user-id-456,Computer`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

