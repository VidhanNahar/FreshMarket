import type { WebhookPayload } from "@/freshpay/webhooks";

export interface OutboxEntry {
  payload: WebhookPayload;
  attempts: number;
  nextAttemptAt: number; // Unix ms
  status: "pending" | "delivered" | "failed";
  lastError?: string;
}

/**
 * Durable state for webhook delivery. Every write is idempotent, so a dispatcher that crashes
 * at any point can rerun from the stored cursor without losing or duplicating an event ID.
 */
export interface WebhookStore {
  getCursor(): Promise<bigint | null>;
  setCursor(block: bigint): Promise<void>;
  /** Adds the event once; false when the ID is already known (pending, delivered or failed). */
  enqueue(payload: WebhookPayload, now: number): Promise<boolean>;
  due(now: number, limit: number): Promise<OutboxEntry[]>;
  save(entry: OutboxEntry): Promise<void>;
  acquireLock(token: string, ttlMs: number): Promise<boolean>;
  releaseLock(token: string): Promise<void>;
  /** Receiver side: stores `value` under `key` once; false for a duplicate. */
  recordOnce(key: string, value: string): Promise<boolean>;
}

export class MemoryWebhookStore implements WebhookStore {
  cursor: bigint | null = null;
  readonly entries = new Map<string, OutboxEntry>();
  readonly records = new Map<string, string>();
  private lock: { token: string; until: number } | null = null;

  async getCursor() { return this.cursor; }
  async setCursor(block: bigint) { this.cursor = block; }
  async enqueue(payload: WebhookPayload, now: number) {
    if (this.entries.has(payload.id)) return false;
    this.entries.set(payload.id, { payload, attempts: 0, nextAttemptAt: now, status: "pending" });
    return true;
  }
  async due(now: number, limit: number) {
    return [...this.entries.values()].filter((entry) => entry.status === "pending" && entry.nextAttemptAt <= now)
      .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt).slice(0, limit).map((entry) => structuredClone(entry));
  }
  async save(entry: OutboxEntry) { this.entries.set(entry.payload.id, structuredClone(entry)); }
  async acquireLock(token: string, ttlMs: number) {
    if (this.lock && this.lock.until > Date.now()) return false;
    this.lock = { token, until: Date.now() + ttlMs };
    return true;
  }
  async releaseLock(token: string) { if (this.lock?.token === token) this.lock = null; }
  async recordOnce(key: string, value: string) {
    if (this.records.has(key)) return false;
    this.records.set(key, value);
    return true;
  }
}

// Atomic: the record and its due-queue entry are written together or not at all.
const ENQUEUE_SCRIPT = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[3]) then
  redis.call('ZADD', KEYS[2], ARGV[2], ARGV[4])
  return 1
end
return 0`;
const SAVE_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
if ARGV[2] == 'pending' then redis.call('ZADD', KEYS[2], ARGV[3], ARGV[5]) else redis.call('ZREM', KEYS[2], ARGV[5]) end
return 1`;
const UNLOCK_SCRIPT = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
const RETENTION_SECONDS = String(30 * 24 * 3600);

/** Redis-compatible REST store (e.g. Upstash). Keys share a hash tag for cluster compatibility. */
export class RedisWebhookStore implements WebhookStore {
  private readonly prefix: string;
  constructor(private readonly url: URL, private readonly token: string, namespace: string) {
    this.prefix = `fm:freshpay:{${namespace.toLowerCase()}}`;
  }

  private async command<T>(...args: string[]): Promise<T> {
    const response = await fetch(this.url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5_000),
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    if (!response.ok) throw new Error(`Webhook state store returned ${response.status}`);
    const data = await response.json() as { result?: T; error?: string };
    if (data.error) throw new Error("Webhook state store rejected a command");
    return data.result as T;
  }
  private key(name: string) { return `${this.prefix}:${name}`; }

  async getCursor() {
    const value = await this.command<string | null>("GET", this.key("cursor"));
    return value === null ? null : BigInt(value);
  }
  async setCursor(block: bigint) { await this.command("SET", this.key("cursor"), block.toString()); }
  async enqueue(payload: WebhookPayload, now: number) {
    const entry: OutboxEntry = { payload, attempts: 0, nextAttemptAt: now, status: "pending" };
    return (await this.command<number>("EVAL", ENQUEUE_SCRIPT, "2", this.key(`event:${payload.id}`), this.key("due"),
      JSON.stringify(entry), String(now), RETENTION_SECONDS, payload.id)) === 1;
  }
  async due(now: number, limit: number) {
    const ids = await this.command<string[]>("ZRANGEBYSCORE", this.key("due"), "-inf", String(now), "LIMIT", "0", String(limit));
    if (!ids.length) return [];
    const values = await this.command<(string | null)[]>("MGET", ...ids.map((id) => this.key(`event:${id}`)));
    return values.flatMap((value) => (value ? [JSON.parse(value) as OutboxEntry] : []));
  }
  async save(entry: OutboxEntry) {
    await this.command("EVAL", SAVE_SCRIPT, "2", this.key(`event:${entry.payload.id}`), this.key("due"),
      JSON.stringify(entry), entry.status, String(entry.nextAttemptAt), RETENTION_SECONDS, entry.payload.id);
  }
  async acquireLock(token: string, ttlMs: number) {
    return (await this.command<string | null>("SET", this.key("lock"), token, "NX", "PX", String(ttlMs))) === "OK";
  }
  async releaseLock(token: string) { await this.command("EVAL", UNLOCK_SCRIPT, "1", this.key("lock"), token); }
  async recordOnce(key: string, value: string) {
    return (await this.command<string | null>("SET", this.key(`record:${key}`), value, "NX")) === "OK";
  }
}

let memoryStore: MemoryWebhookStore | null = null;

/** Production needs shared durable state; development falls back to process memory. */
export function getWebhookStore(namespace: string): WebhookStore {
  const endpoint = process.env.FRESHPAY_STATE_URL;
  const token = process.env.FRESHPAY_STATE_TOKEN;
  if (endpoint || token || process.env.NODE_ENV === "production") {
    if (!endpoint || !token) throw new Error("FRESHPAY_STATE_URL and FRESHPAY_STATE_TOKEN are required");
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("FRESHPAY_STATE_URL must be a plain https URL");
    return new RedisWebhookStore(url, token, namespace);
  }
  return (memoryStore ??= new MemoryWebhookStore());
}
