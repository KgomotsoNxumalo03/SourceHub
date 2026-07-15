import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const profileSchema = z.object({
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  profileImageUrl: z.string().trim().url("Enter a valid image URL").optional().or(z.literal("")),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(8, "Enter your current password"),
    newPassword: z.string().min(12, "New password must be at least 12 characters"),
    confirmPassword: z.string().min(12, "Confirm the new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const userFormSchema = z.object({
  employeeNumber: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  profileImageUrl: z.string().trim().url().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  roleIds: z.array(z.string().min(1)).default([]),
  password: z.string().min(12).optional().or(z.literal("")),
});

export const roleFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(255).optional().or(z.literal("")),
  isSystemRole: z.coerce.boolean().default(false),
  permissionIds: z.array(z.string().min(1)).default([]),
});

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(4, "Subject is required").max(160),
  description: z.string().trim().min(10, "Description is required"),
  categoryId: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  requesterId: z.string().trim().optional().or(z.literal("")),
  assigneeId: z.string().trim().optional().or(z.literal("")),
});

export const ticketUpdateSchema = z.object({
  subject: z.string().trim().min(4, "Subject is required").max(160),
  description: z.string().trim().min(10, "Description is required"),
  categoryId: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  status: z.enum(["NEW", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"]),
});

export const ticketAssignmentSchema = z.object({
  assigneeId: z.string().trim().optional().or(z.literal("")),
});

export const ticketCommentSchema = z.object({
  body: z.string().trim().min(1, "Add a message before submitting"),
  visibility: z.enum(["public", "internal"]),
});

export const ticketListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  search: z.string().trim().optional().default(""),
  status: z.string().trim().optional().default(""),
  priority: z.string().trim().optional().default(""),
  category: z.string().trim().optional().default(""),
  queue: z.string().trim().optional().default("all"),
});

export const settingsSchema = z.object({
  companyName: z.string().trim().min(1),
  tradingName: z.string().trim().min(1),
  supportEmail: z.string().trim().email(),
  contactNumber: z.string().trim().min(1),
  website: z.string().trim().url(),
  timezone: z.string().trim().min(1),
  country: z.string().trim().min(1),
  defaultDateFormat: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  primaryColor: z.string().trim().min(1),
  secondaryColor: z.string().trim().min(1),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional().default(""),
  status: z.string().trim().optional().default(""),
  role: z.string().trim().optional().default(""),
});
