import { mobileJsonError, revokeMobileSession } from "@/lib/mobile-auth";

export async function POST(request: Request) {
  try { await revokeMobileSession(request); return Response.json({ ok: true }); } catch (error) { return mobileJsonError(error); }
}
