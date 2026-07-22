import { runAiRequest } from "@/lib/ai";
import { authenticateMobileRequest, mobileJsonError } from "@/lib/mobile-auth";
import { type CurrentUser, type UserStatus } from "@/lib/permissions";
import { z } from "zod";

const requestSchema = z.object({ prompt: z.string().trim().min(1).max(4000), context: z.object({ module: z.string().trim().max(80).optional(), type: z.string().trim().max(40).optional(), id: z.string().trim().max(160).optional() }).optional() });

export async function POST(request: Request) {
  try {
    const { principal } = await authenticateMobileRequest(request);
    if (!principal.mobilePermissions.includes("mobile.ai.use") || !principal.permissions.includes("ai.use")) return Response.json({ error: "You do not have permission to use SourceHub AI.", code: "AI_ACCESS_REQUIRED" }, { status: 403 });
    const input = requestSchema.parse(await request.json());
    const actor = { id: principal.id, employeeNumber: principal.employeeNumber, firstName: principal.firstName, lastName: principal.lastName, email: principal.email, phone: null, jobTitle: principal.jobTitle, department: null, profileImageUrl: null, status: principal.status as UserStatus, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(), roles: principal.roles.map((name) => ({ id: name, name, description: null, isSystemRole: false })), permissions: principal.permissions } satisfies CurrentUser;
    const result = await runAiRequest(actor, input.prompt, input.context ?? {});
    return Response.json({ result });
  } catch (error) { return mobileJsonError(error); }
}
