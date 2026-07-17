import Link from "next/link";

import { createClientAction } from "@/lib/actions/clients";
import { buttonClassName } from "@/lib/button";
import { requirePermission } from "@/lib/auth";
import { env } from "@/lib/env";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default async function NewClientPage() {
  await requirePermission("clients.create");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Clients & CRM"
        title="New client"
        description="Create a client record with CRM metadata, billing details, and support scoping."
        actions={
          <Link href="/clients" className={buttonClassName({ variant: "outline" })}>
            Back to clients
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Client details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createClientAction} className="space-y-6">
            <input type="hidden" name="workspaceId" value={env.DEFAULT_WORKSPACE_ID} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-sourcehub-text">Client name *</label>
                <Input id="name" name="name" required placeholder="Acme Holdings" />
              </div>
              <div className="space-y-2">
                <label htmlFor="code" className="text-sm font-medium text-sourcehub-text">Client code *</label>
                <Input id="code" name="code" required placeholder="ACME" />
              </div>
              <div className="space-y-2">
                <label htmlFor="legalName" className="text-sm font-medium text-sourcehub-text">Legal name</label>
                <Input id="legalName" name="legalName" placeholder="Acme Holdings (Pty) Ltd" />
              </div>
              <div className="space-y-2">
                <label htmlFor="status" className="text-sm font-medium text-sourcehub-text">Status</label>
                <Select id="status" name="status" defaultValue="ACTIVE">
                  <option value="ACTIVE">Active</option>
                  <option value="ONBOARDING">Onboarding</option>
                  <option value="PAUSED">Paused</option>
                  <option value="FORMER">Former</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="website" className="text-sm font-medium text-sourcehub-text">Website</label>
                <Input id="website" name="website" type="url" placeholder="https://example.com" />
              </div>
              <div className="space-y-2">
                <label htmlFor="supportEmail" className="text-sm font-medium text-sourcehub-text">Support email</label>
                <Input id="supportEmail" name="supportEmail" type="email" placeholder="help@example.com" />
              </div>
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium text-sourcehub-text">Phone</label>
                <Input id="phone" name="phone" placeholder="+27 11 000 0000" />
              </div>
              <div className="space-y-2">
                <label htmlFor="industry" className="text-sm font-medium text-sourcehub-text">Industry</label>
                <Input id="industry" name="industry" placeholder="Finance" />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="accountManagerId" className="text-sm font-medium text-sourcehub-text">Account manager ID</label>
              <Input id="accountManagerId" name="accountManagerId" placeholder="User ID" />
              <p className="text-xs text-slate-500">You can assign an account manager later if you do not have the user ID now.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-medium text-sourcehub-text">Internal notes</label>
              <Textarea id="notes" name="notes" placeholder="Optional notes for onboarding, commercial context, or account history." />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit">Create client</Button>
              <Link href="/clients" className={buttonClassName({ variant: "ghost" })}>
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
