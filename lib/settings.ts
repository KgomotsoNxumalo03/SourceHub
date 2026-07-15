import "server-only";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const defaultSettings = {
  companyProfile: {
    companyName: env.DEFAULT_COMPANY_NAME,
    tradingName: env.DEFAULT_TRADING_NAME,
    supportEmail: env.DEFAULT_SUPPORT_EMAIL,
    contactNumber: env.DEFAULT_CONTACT_NUMBER,
    website: env.DEFAULT_WEBSITE,
    timezone: env.DEFAULT_TIMEZONE,
    country: env.DEFAULT_COUNTRY,
    defaultDateFormat: env.DEFAULT_DATE_FORMAT,
  },
  branding: {
    displayName: env.NEXT_PUBLIC_APP_NAME,
    logoUrl: "",
    primaryColor: "#0F46B0",
    secondaryColor: "#11386D",
  },
};

export async function getSettings() {
  const records = await prisma.setting.findMany();
  const map = new Map(records.map((record) => [record.key, record.value]));

  return {
    companyProfile: {
      companyName:
        (map.get("companyProfile.companyName") as string | undefined) ??
        defaultSettings.companyProfile.companyName,
      tradingName:
        (map.get("companyProfile.tradingName") as string | undefined) ??
        defaultSettings.companyProfile.tradingName,
      supportEmail:
        (map.get("companyProfile.supportEmail") as string | undefined) ??
        defaultSettings.companyProfile.supportEmail,
      contactNumber:
        (map.get("companyProfile.contactNumber") as string | undefined) ??
        defaultSettings.companyProfile.contactNumber,
      website:
        (map.get("companyProfile.website") as string | undefined) ??
        defaultSettings.companyProfile.website,
      timezone:
        (map.get("companyProfile.timezone") as string | undefined) ??
        defaultSettings.companyProfile.timezone,
      country:
        (map.get("companyProfile.country") as string | undefined) ??
        defaultSettings.companyProfile.country,
      defaultDateFormat:
        (map.get("companyProfile.defaultDateFormat") as string | undefined) ??
        defaultSettings.companyProfile.defaultDateFormat,
    },
    branding: {
      displayName:
        (map.get("branding.displayName") as string | undefined) ??
        defaultSettings.branding.displayName,
      logoUrl:
        (map.get("branding.logoUrl") as string | undefined) ??
        defaultSettings.branding.logoUrl,
      primaryColor:
        (map.get("branding.primaryColor") as string | undefined) ??
        defaultSettings.branding.primaryColor,
      secondaryColor:
        (map.get("branding.secondaryColor") as string | undefined) ??
        defaultSettings.branding.secondaryColor,
    },
  };
}

export async function upsertSettings(settings: Record<string, string>) {
  await prisma.$transaction(
    Object.entries(settings).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
  );
}
