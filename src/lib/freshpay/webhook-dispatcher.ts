import { randomUUID } from "node:crypto";
import type { Address, PublicClient } from "viem";
import { readOrderEvents, WHITECHAIN_SEPOLIA_CHAIN_ID } from "@/freshpay";
import {
  EVENT_ID_HEADER, IDEMPOTENCY_HEADER, MAX_DELIVERY_ATTEMPTS, SIGNATURE_HEADER, retryDelayMs, signWebhook, toWebhookPayload,
  type WebhookPayload,
} from "@/freshpay/webhooks";
import type { WebhookStore } from "./webhook-store";

/** Blocks to wait before notifying, so a short L2 reorg cannot announce a payment that vanished. */
export const DEFAULT_CONFIRMATIONS = 10n;
/** Blocks per eth_getLogs call; Whitechain makes one block per second. */
export const MAX_SCAN_RANGE = 5_000n;

export type Deliver = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status">>;

export interface DispatchOptions {
  client: Pick<PublicClient, "getBlockNumber" | "request">;
  contract: Address;
  deployBlock: bigint;
  store: WebhookStore;
  endpoint: string;
  secret: string;
  deliver?: Deliver;
  now?: () => number;
  confirmations?: bigint;
  maxBatches?: number;
}

export interface DispatchResult {
  scannedTo: bigint | null;
  enqueued: number;
  delivered: number;
  retried: number;
  failed: number;
  skipped?: "locked";
}

export async function deliverPayload(payload: WebhookPayload, endpoint: string, secret: string, deliver: Deliver, now: number) {
  const body = JSON.stringify(payload);
  return deliver(endpoint, {
    method: "POST", body, redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/json",
      [SIGNATURE_HEADER]: signWebhook(secret, body, Math.floor(now / 1000)),
      [EVENT_ID_HEADER]: payload.id,
      [IDEMPOTENCY_HEADER]: payload.id,
    },
  });
}

/**
 * One dispatcher run: scan confirmed FreshPay events after the cursor into the outbox, advance
 * the cursor, then deliver due events. The cursor moves only after its events are enqueued, and an
 * event leaves the outbox only after a 2xx, so a crash anywhere causes redelivery, never loss.
 */
export async function dispatchWebhooks(options: DispatchOptions): Promise<DispatchResult> {
  const now = options.now ?? Date.now;
  const deliver = options.deliver ?? fetch;
  const result: DispatchResult = { scannedTo: null, enqueued: 0, delivered: 0, retried: 0, failed: 0 };
  const token = randomUUID();
  if (!(await options.store.acquireLock(token, 55_000))) return { ...result, skipped: "locked" };
  try {
    const head = await options.client.getBlockNumber({ cacheTime: 0 });
    const confirmed = head - (options.confirmations ?? DEFAULT_CONFIRMATIONS);
    let cursor = (await options.store.getCursor()) ?? options.deployBlock - 1n;
    for (let batch = 0; batch < (options.maxBatches ?? 20) && cursor < confirmed; batch++) {
      const toBlock = cursor + MAX_SCAN_RANGE < confirmed ? cursor + MAX_SCAN_RANGE : confirmed;
      const events = await readOrderEvents(options.client as PublicClient, options.contract, { fromBlock: cursor + 1n, toBlock });
      for (const event of events) {
        if (await options.store.enqueue(toWebhookPayload(WHITECHAIN_SEPOLIA_CHAIN_ID, options.contract, event), now())) result.enqueued++;
      }
      await options.store.setCursor(toBlock);
      cursor = toBlock;
      result.scannedTo = toBlock;
    }

    for (const entry of await options.store.due(now(), 50)) {
      const attempt = entry.attempts + 1;
      let error: string | undefined;
      try {
        const response = await deliverPayload(entry.payload, options.endpoint, options.secret, deliver, now());
        if (!response.ok) error = `HTTP ${response.status}`;
      } catch (cause) {
        error = cause instanceof Error ? cause.name : "Delivery failed";
      }
      if (!error) {
        await options.store.save({ ...entry, attempts: attempt, status: "delivered", lastError: undefined });
        result.delivered++;
      } else if (attempt >= MAX_DELIVERY_ATTEMPTS) {
        await options.store.save({ ...entry, attempts: attempt, status: "failed", lastError: error });
        result.failed++;
      } else {
        await options.store.save({ ...entry, attempts: attempt, nextAttemptAt: now() + retryDelayMs(attempt), lastError: error });
        result.retried++;
      }
    }
    return result;
  } finally {
    await options.store.releaseLock(token).catch(() => undefined);
  }
}
