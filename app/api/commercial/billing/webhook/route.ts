import { processBillingWebhook } from "@/lib/commercial";

export async function POST(request: Request) {
  try {
    const rawPayload = await request.text();
    const signature = request.headers.get("x-sourcehub-billing-signature") ?? "";
    const timestamp = request.headers.get("x-sourcehub-billing-timestamp") ?? "";
    return Response.json(await processBillingWebhook({ rawPayload, signature, timestamp }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Billing webhook rejected." }, { status: 400 });
  }
}
