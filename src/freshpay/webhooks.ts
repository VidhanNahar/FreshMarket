/**
 * FreshPay webhooks: signed, at-least-once notifications of order events. Server-only
 * (node:crypto). Merchants verify deliveries with `verifyWebhook` and deduplicate by event ID.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Address, Hex } from "viem";
import type { OrderEvent } from "./sdk";

export const SIGNATURE_HEADER = "freshpay-signature";
export const EVENT_ID_HEADER = "freshpay-event-id";
export const IDEMPOTENCY_HEADER = "idempotency-key";
export const DEFAULT_TOLERANCE_SECONDS = 300;

export interface WebhookPayload {
  id: string; // Stable across retries: chainId:txHash:logIndex
  type: `order.${OrderEvent["type"]}`;
  chainId: number;
  contract: Address;
  data: {
    orderId: string; // Decimal string; JSON has no bigint
    merchant: Address;
    buyer: Address;
    amount: string; // USDT minor units (6 decimals)
    totalRefunded?: string;
    ref?: Hex;
    txHash: Hex;
    blockNumber: string;
    logIndex: number;
  };
}

/** The same chain log always yields the same ID, so replays and rescans deduplicate. */
export function webhookEventId(chainId: number, event: Pick<OrderEvent, "txHash" | "logIndex">): string {
  return `${chainId}:${event.txHash.toLowerCase()}:${event.logIndex}`;
}

export function toWebhookPayload(chainId: number, contract: Address, event: OrderEvent): WebhookPayload {
  return {
    id: webhookEventId(chainId, event),
    type: `order.${event.type}`,
    chainId,
    contract,
    data: {
      orderId: event.orderId.toString(), merchant: event.merchant, buyer: event.buyer, amount: event.amount.toString(),
      ...(event.totalRefunded !== undefined ? { totalRefunded: event.totalRefunded.toString() } : {}),
      ...(event.ref ? { ref: event.ref } : {}),
      txHash: event.txHash, blockNumber: event.blockNumber.toString(), logIndex: event.logIndex,
    },
  };
}

const hmac = (secret: string, timestamp: number, body: string) =>
  createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`; the timestamp blocks old replays. */
export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  if (!secret) throw new Error("A webhook secret is required");
  return `t=${timestamp},v1=${hmac(secret, timestamp, body)}`;
}

/** Checks the signature over the raw body, in constant time, within a replay window. */
export function verifyWebhook(input: { secret: string; body: string; signature: string | null; toleranceSeconds?: number; now?: number }): boolean {
  if (!input.secret || !input.signature) return false;
  const parts = Object.fromEntries(input.signature.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isSafeInteger(timestamp) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > (input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)) return false;
  return timingSafeEqual(Buffer.from(hmac(input.secret, timestamp, input.body), "hex"), Buffer.from(parts.v1, "hex"));
}

export const MAX_DELIVERY_ATTEMPTS = 8;

/** 30 s, 1 min, 2 min … capped at 1 hour, so a receiver outage is retried for about 2 hours. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);
}
