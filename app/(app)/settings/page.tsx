import { Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Button } from "@/components/ui";
import { updateSettingsAction } from "@/lib/actions/settings";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { hasPermission } from "@/lib/permissions";
import { ThemeSettings } from "@/components/theme-settings";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("settings.view");

  const params = (await searchParams) ?? {};
  const settings = await getSettings();
  const canEdit = hasPermission(user, "settings.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="SourceHub settings"
        description="Maintain company profile and branding data in the database."
      />

      <Card className="overflow-hidden border-sourcehub-primary/20 bg-[linear-gradient(135deg,rgb(var(--sourcehub-primary)/0.10),rgb(var(--sourcehub-accent)/0.08))]">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <p className="mt-1 text-sm text-slate-600">Choose the workspace theme. Your preference is saved on this device.</p>
        </CardHeader>
        <CardContent>
          <ThemeSettings />
        </CardContent>
      </Card>

      {params.updated ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Settings saved successfully.
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {String(params.error)}
        </div>
      ) : null}

      <form action={updateSettingsAction} className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="companyName">
                Company name <span className="text-sourcehub-primary">*</span>
              </label>
              <Input id="companyName" name="companyName" defaultValue={settings.companyProfile.companyName} required disabled={!canEdit} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="tradingName">
                Trading name <span className="text-sourcehub-primary">*</span>
              </label>
              <Input id="tradingName" name="tradingName" defaultValue={settings.companyProfile.tradingName} required disabled={!canEdit} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="supportEmail">
                  Support email <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="supportEmail" name="supportEmail" type="email" defaultValue={settings.companyProfile.supportEmail} required disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="contactNumber">
                  Contact number <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="contactNumber" name="contactNumber" defaultValue={settings.companyProfile.contactNumber} required disabled={!canEdit} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="website">
                Website <span className="text-sourcehub-primary">*</span>
              </label>
              <Input id="website" name="website" type="url" defaultValue={settings.companyProfile.website} required disabled={!canEdit} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="timezone">
                  Timezone <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="timezone" name="timezone" defaultValue={settings.companyProfile.timezone} required disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="country">
                  Country <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="country" name="country" defaultValue={settings.companyProfile.country} required disabled={!canEdit} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="defaultDateFormat">
                Default date format <span className="text-sourcehub-primary">*</span>
              </label>
              <Input id="defaultDateFormat" name="defaultDateFormat" defaultValue={settings.companyProfile.defaultDateFormat} required disabled={!canEdit} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="displayName">
                SourceHub display name <span className="text-sourcehub-primary">*</span>
              </label>
              <Input id="displayName" name="displayName" defaultValue={settings.branding.displayName} required disabled={!canEdit} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-sourcehub-text" htmlFor="logoUrl">
                Logo URL placeholder
              </label>
              <Input id="logoUrl" name="logoUrl" type="url" defaultValue={settings.branding.logoUrl} placeholder="https://..." disabled={!canEdit} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="primaryColor">
                  Primary colour <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="primaryColor" name="primaryColor" defaultValue={settings.branding.primaryColor} required disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-sourcehub-text" htmlFor="secondaryColor">
                  Secondary colour <span className="text-sourcehub-primary">*</span>
                </label>
                <Input id="secondaryColor" name="secondaryColor" defaultValue={settings.branding.secondaryColor} required disabled={!canEdit} />
              </div>
            </div>
            {canEdit ? (
              <Button type="submit">Save settings</Button>
            ) : (
              <div className="rounded-2xl border border-sourcehub-border bg-sourcehub-muted px-4 py-3 text-sm text-slate-600">
                Read-only access. You can view settings but cannot modify them.
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
