import { mobileJsonError, createMobileSession } from "@/lib/mobile-auth";
import { mobileLoginSchema } from "@/lib/validators-mobile";

export async function POST(request: Request) {
  try {
    const input = mobileLoginSchema.parse(await request.json());
    const result = await createMobileSession({ ...input, request });
    return Response.json(result);
  } catch (error) { return mobileJsonError(error); }
}
