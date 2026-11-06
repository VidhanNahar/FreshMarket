import { timingSafeEqual } from "node:crypto";
import { whitechainPublicClient } from "@/lib/freshpay/client";
import { freshPayConfig } from "@/lib/freshpay/config";
import { dispatchWebhooks } from "@/lib/freshpay/webhook-dispatcher";
import { getWebhookStore } from "@/lib/freshpay/webhook-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const fail = (error: string, status: number) => Response.json({ error }, { status });

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return Boolean(secret) && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Run by a scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`) or the worker script. */
export async function GET(request: Request) {
  if (!authorized(request)) return fail("Unauthorized", 401);
  const endpoint = process.env.FRESHPAY_WEBHOOK_URL;
  const secret = process.env.FRESHPAY_WEBHOOK_SECRET;
  if (!freshPayConfig.contract || !endpoint || !secret) return fail("FreshPay webhooks are not configured", 503);
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error();
  } catch { return fail("FRESHPAY_WEBHOOK_URL is invalid", 503); }
  try {
    const result = await dispatchWebhooks({
      client: whitechainPublicClient, contract: freshPayConfig.contract, deployBlock: freshPayConfig.deployBlock,
      store: getWebhookStore(freshPayConfig.contract), endpoint, secret,
    });
    return Response.json({ ...result, scannedTo: result.scannedTo?.toString() ?? null });
  } catch {
    // Nothing is lost: the cursor and outbox only advance after successful steps.
    return fail("Dispatch failed; it will resume from the stored cursor on the next run", 502);
  }
}
