import { authenticateMobileRequest, mobileJsonError } from "@/lib/mobile-auth";

export async function GET(request: Request) {
  try { const result = await authenticateMobileRequest(request); return Response.json({ user: result.principal, versionPolicy: result.versionPolicy }); } catch (error) { return mobileJsonError(error); }
}
