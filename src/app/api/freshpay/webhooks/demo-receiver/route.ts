import { SIGNATURE_HEADER, verifyWebhook, type WebhookPayload } from "@/freshpay/webhooks";
import { getWebhookStore } from "@/lib/freshpay/webhook-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Example merchant receiver: verify the signature over the raw body, then create each order once.
 * Retries and rescans resend the same event ID, so duplicates are acknowledged and ignored.
 */
export async function POST(request: Request) {
  const secret = process.env.FRESHPAY_WEBHOOK_SECRET ?? "";
  const body = await request.text();
  if (!verifyWebhook({ secret, body, signature: request.headers.get(SIGNATURE_HEADER) })) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  const event = JSON.parse(body) as WebhookPayload;
  const store = getWebhookStore("demo-receiver");
  const fresh = await store.recordOnce(`event:${event.id}`, body);
  // A paid event creates an order record; keyed by order ID so even a distinct event cannot duplicate it.
  const orderCreated = fresh && event.type === "order.paid"
    ? await store.recordOnce(`order:${event.contract.toLowerCase()}:${event.data.orderId}`, body) : false;
  return Response.json({ received: true, duplicate: !fresh, orderCreated });
}
