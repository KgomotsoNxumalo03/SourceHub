import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .default("file:./dev.db"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("SourceHub"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  DEV_ADMIN_EMAIL: z.string().email().default("admin@sourcehub.local"),
  DEV_ADMIN_PASSWORD: z.string().min(12).default("SourceHub123!"),
  DEV_ADMIN_FIRST_NAME: z.string().min(1).default("Dev"),
  DEV_ADMIN_LAST_NAME: z.string().min(1).default("Administrator"),
  DEV_ADMIN_EMPLOYEE_NUMBER: z.string().min(1).default("SH-0001"),
  DEV_ADMIN_JOB_TITLE: z.string().min(1).default("Platform Administrator"),
  DEV_ADMIN_DEPARTMENT: z.string().min(1).default("IT Operations"),
  DEFAULT_COMPANY_NAME: z.string().min(1).default("Source IT Services"),
  DEFAULT_TRADING_NAME: z.string().min(1).default("SourceHub"),
  DEFAULT_SUPPORT_EMAIL: z.string().email().default("support@sourceitservices.co.za"),
  DEFAULT_CONTACT_NUMBER: z.string().min(1).default("+27 11 000 0000"),
  DEFAULT_WEBSITE: z.string().url().default("https://sourceitservices.co.za"),
  DEFAULT_TIMEZONE: z.string().min(1).default("Africa/Johannesburg"),
  DEFAULT_COUNTRY: z.string().min(1).default("South Africa"),
  DEFAULT_DATE_FORMAT: z.string().min(1).default("dd MMM yyyy"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${parsed.error.issues
      .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")}`,
  );
}

export const env = parsed.data;
