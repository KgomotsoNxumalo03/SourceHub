"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { upsertSettings } from "@/lib/settings";
import { settingsSchema } from "@/lib/validators";

export async function updateSettingsAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("settings.manage")) {
    redirect("/access-denied");
  }

  const payload = settingsSchema.safeParse({
    companyName: formData.get("companyName"),
    tradingName: formData.get("tradingName"),
    supportEmail: formData.get("supportEmail"),
    contactNumber: formData.get("contactNumber"),
    website: formData.get("website"),
    timezone: formData.get("timezone"),
    country: formData.get("country"),
    defaultDateFormat: formData.get("defaultDateFormat"),
    displayName: formData.get("displayName"),
    logoUrl: formData.get("logoUrl"),
    primaryColor: formData.get("primaryColor"),
    secondaryColor: formData.get("secondaryColor"),
  });

  if (!payload.success) {
    redirect(`/settings?error=${encodeURIComponent(payload.error.issues[0]?.message ?? "Please review the settings form.")}`);
  }

  const data = payload.data!;

  await upsertSettings({
    "companyProfile.companyName": data.companyName,
    "companyProfile.tradingName": data.tradingName,
    "companyProfile.supportEmail": data.supportEmail,
    "companyProfile.contactNumber": data.contactNumber,
    "companyProfile.website": data.website,
    "companyProfile.timezone": data.timezone,
    "companyProfile.country": data.country,
    "companyProfile.defaultDateFormat": data.defaultDateFormat,
    "branding.displayName": data.displayName,
    "branding.logoUrl": data.logoUrl || "",
    "branding.primaryColor": data.primaryColor,
    "branding.secondaryColor": data.secondaryColor,
  });

  await logAudit({
    userId: user.id,
    action: "settings.update",
    entityType: "Setting",
    entityId: "sourcehub-settings",
    newValues: data,
    ipAddress:
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers().get("x-real-ip") ??
      null,
  });

  redirect("/settings?updated=1");
}
