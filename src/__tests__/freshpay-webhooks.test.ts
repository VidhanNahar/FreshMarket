import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, toHex, type Hex } from "viem";
import { freshPayAbi } from "@/freshpay/abi";
import { MAX_DELIVERY_ATTEMPTS, retryDelayMs, signWebhook, verifyWebhook, type WebhookPayload } from "@/freshpay/webhooks";
import { dispatchWebhooks, type Deliver } from "@/lib/freshpay/webhook-dispatcher";
import { MemoryWebhookStore } from "@/lib/freshpay/webhook-store";

const contract = "0x00000000000000000000000000000000000f5e5a" as const;
const merchant = "0x1111111111111111111111111111111111111111" as const;
const buyer = "0x2222222222222222222222222222222222222222" as const;
const secret = "whsec_test";

function rawPaidLog(orderId: bigint, block: bigint, logIndex = 0) {
  return {
    address: contract, transactionHash: toHex(orderId, { size: 32 }), blockNumber: toHex(block), logIndex: toHex(logIndex),
    topics: encodeEventTopics({ abi: freshPayAbi, eventName: "OrderPaid", args: { orderId, merchant, buyer } }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "uint64" }], [`0x${"ab".repeat(32)}`, 12_500_000n, 1n]),
  };
}

/** A fake Whitechain node whose getLogs honours the requested block range. */
function chain(head: bigint, logs: ReturnType<typeof rawPaidLog>[]) {
  const request = vi.fn(async ({ params: [filter] }: { params: [{ fromBlock: Hex; toBlock: Hex }] }) =>
    logs.filter((log) => BigInt(log.blockNumber) >= BigInt(filter.fromBlock) && BigInt(log.blockNumber) <= BigInt(filter.toBlock)));
  return { getBlockNumber: vi.fn(async () => head), request } as never;
}

const ok: Deliver = async () => ({ ok: true, status: 200 });
let clock = 1_000_000;
const now = () => clock;
afterEach(() => { clock = 1_000_000; vi.unstubAllEnvs(); });

describe("Phase 10: webhook signatures", () => {
  it("signs the raw body with a timestamp and verifies in constant time", () => {
    const body = JSON.stringify({ id: "1874:0xabc:0" });
    const signature = signWebhook(secret, body, 1_700_000_000);
    expect(signature).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verifyWebhook({ secret, body, signature, now: 1_700_000_100 })).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets, stale timestamps and malformed headers", () => {
    const body = "{}";
    const signature = signWebhook(secret, body, 1_700_000_000);
    expect(verifyWebhook({ secret, body: "{ }", signature, now: 1_700_000_000 })).toBe(false);
    expect(verifyWebhook({ secret: "other", body, signature, now: 1_700_000_000 })).toBe(false);
    expect(verifyWebhook({ secret, body, signature, now: 1_700_000_301 })).toBe(false);
    expect(verifyWebhook({ secret, body, signature: "v1=abc", now: 1_700_000_000 })).toBe(false);
    expect(verifyWebhook({ secret, body, signature: null })).toBe(false);
    expect(() => signWebhook("", body)).toThrow("secret");
  });

  it("backs off exponentially up to one hour", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(retryDelayMs(20)).toBe(3_600_000);
  });
});

describe("Phase 10: webhook dispatcher", () => {
  const base = { contract, deployBlock: 100n, endpoint: "https://merchant.example/hooks", secret, now, confirmations: 10n };

  it("delivers each confirmed event once with signature and idempotency headers", async () => {
    const store = new MemoryWebhookStore();
    const deliver = vi.fn(ok);
    const client = chain(200n, [rawPaidLog(1n, 150n), rawPaidLog(2n, 195n)]);
    const result = await dispatchWebhooks({ ...base, client, store, deliver });

    expect(result).toMatchObject({ scannedTo: 190n, enqueued: 1, delivered: 1 }); // Block 195 is not yet confirmed.
    const [url, init] = deliver.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    const payload = JSON.parse(init.body as string) as WebhookPayload;
    expect(url).toBe(base.endpoint);
    expect(payload).toMatchObject({ type: "order.paid", chainId: 1874, data: { orderId: "1", merchant, amount: "12500000" } });
    expect(headers["idempotency-key"]).toBe(payload.id);
    expect(verifyWebhook({ secret, body: init.body as string, signature: headers["freshpay-signature"], now: clock / 1000 })).toBe(true);

    // Next run: the cursor moved on, so only the newly confirmed event is sent.
    const next = await dispatchWebhooks({ ...base, client: chain(210n, [rawPaidLog(1n, 150n), rawPaidLog(2n, 195n)]), store, deliver });
    expect(next).toMatchObject({ enqueued: 1, delivered: 1 });
    expect(deliver.mock.calls.map(([, init]) => JSON.parse(init.body as string).data.orderId)).toEqual(["1", "2"]);
  });

  it("recovers after a crash between enqueue and cursor update without duplicating events", async () => {
    const store = new MemoryWebhookStore();
    const setCursor = vi.spyOn(store, "setCursor").mockRejectedValueOnce(new Error("worker killed"));
    const logs = [rawPaidLog(1n, 150n)];
    await expect(dispatchWebhooks({ ...base, client: chain(200n, logs), store, deliver: ok })).rejects.toThrow("worker killed");
    expect(store.cursor).toBeNull();
    setCursor.mockRestore();

    const deliver = vi.fn(ok);
    const result = await dispatchWebhooks({ ...base, client: chain(200n, logs), store, deliver });
    expect(result).toMatchObject({ enqueued: 0, delivered: 1 }); // Re-scanned, recognised, delivered once.
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("retries failed deliveries with backoff and keeps the backlog after a crash", async () => {
    const store = new MemoryWebhookStore();
    const client = chain(200n, [rawPaidLog(1n, 150n)]);
    const down = vi.fn<Deliver>(async () => { throw new TypeError("fetch failed"); });
    expect(await dispatchWebhooks({ ...base, client, store, deliver: down })).toMatchObject({ retried: 1, delivered: 0 });

    const entry = [...store.entries.values()][0];
    expect(entry).toMatchObject({ attempts: 1, status: "pending", lastError: "TypeError", nextAttemptAt: clock + 30_000 });
    expect(await dispatchWebhooks({ ...base, client, store, deliver: ok })).toMatchObject({ delivered: 0 }); // Not due yet.
    clock += 30_000;
    expect(await dispatchWebhooks({ ...base, client, store, deliver: ok })).toMatchObject({ delivered: 1 });
    expect([...store.entries.values()][0].status).toBe("delivered");
  });

  it("parks an event as failed after the maximum attempts", async () => {
    const store = new MemoryWebhookStore();
    const client = chain(200n, [rawPaidLog(1n, 150n)]);
    const rejecting: Deliver = async () => ({ ok: false, status: 500 });
    for (let attempt = 0; attempt < MAX_DELIVERY_ATTEMPTS; attempt++) {
      await dispatchWebhooks({ ...base, client, store, deliver: rejecting });
      clock += 3_600_000;
    }
    expect([...store.entries.values()][0]).toMatchObject({ status: "failed", attempts: MAX_DELIVERY_ATTEMPTS, lastError: "HTTP 500" });
    expect(await store.due(clock, 10)).toEqual([]);
  });

  it("lets only one dispatcher run at a time", async () => {
    const store = new MemoryWebhookStore();
    await store.acquireLock("other-worker", 60_000);
    const client = chain(200n, [rawPaidLog(1n, 150n)]);
    expect(await dispatchWebhooks({ ...base, client, store, deliver: ok })).toMatchObject({ skipped: "locked", delivered: 0 });
  });

  it("scans large ranges in bounded batches", async () => {
    const store = new MemoryWebhookStore();
    const client = chain(20_000n, []);
    await dispatchWebhooks({ ...base, client, store, deliver: ok, maxBatches: 2 });
    expect(store.cursor).toBe(99n + 10_000n);
  });
});

describe("Phase 10: demo webhook receiver", () => {
  it("creates an order record once, even when the same event is delivered twice", async () => {
    vi.stubEnv("FRESHPAY_WEBHOOK_SECRET", secret);
    const { POST } = await import("@/app/api/freshpay/webhooks/demo-receiver/route");
    const payload = { id: "1874:0xabc:0", type: "order.paid", chainId: 1874, contract, data: { orderId: "9" } };
    const body = JSON.stringify(payload);
    const send = (signature: string) => POST(new Request("http://localhost/api", { method: "POST", body, headers: { "freshpay-signature": signature } }));

    expect((await send("t=1,v1=" + "0".repeat(64))).status).toBe(401);
    const first = await (await send(signWebhook(secret, body))).json();
    const retry = await (await send(signWebhook(secret, body))).json();
    expect(first).toEqual({ received: true, duplicate: false, orderCreated: true });
    expect(retry).toEqual({ received: true, duplicate: true, orderCreated: false });
  });
});
