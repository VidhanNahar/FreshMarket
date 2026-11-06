import { createHash } from "node:crypto";

export type UploadClaim = "ok" | "replay" | "quota" | "unavailable";
const MAX_UPLOADS = 32;
const MAX_BYTES = 16 * 1024 * 1024;
const localClaims = new Map<string, number>();
const localQuotas = new Map<string, { count: number; bytes: number; until: number }>();

// Atomic across serverless instances. All keys share a wallet hash tag for Redis cluster compatibility.
const CLAIM_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 1 end
local count = tonumber(redis.call('GET', KEYS[2]) or '0')
local bytes = tonumber(redis.call('GET', KEYS[3]) or '0')
if count >= tonumber(ARGV[2]) or bytes + tonumber(ARGV[1]) > tonumber(ARGV[3]) then return 2 end
redis.call('SET', KEYS[1], '1', 'EX', 300)
redis.call('INCR', KEYS[2])
redis.call('INCRBY', KEYS[3], ARGV[1])
redis.call('EXPIRE', KEYS[2], 3600)
redis.call('EXPIRE', KEYS[3], 3600)
return 0`;

export async function claimUpload(message: string, wallet: string, size: number): Promise<UploadClaim> {
  const now = Date.now();
  const hour = Math.floor(now / 3_600_000);
  const identity = wallet.toLowerCase();
  const nonce = createHash("sha256").update(message).digest("hex");
  const keys = [`fm:upload:{${identity}}:nonce:${nonce}`, `fm:upload:{${identity}}:${hour}:count`, `fm:upload:{${identity}}:${hour}:bytes`];
  const endpoint = process.env.SWARM_UPLOAD_STATE_URL;
  const token = process.env.SWARM_UPLOAD_STATE_TOKEN;
  if (endpoint || token || process.env.NODE_ENV === "production") {
    if (!endpoint || !token) return "unavailable";
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "unavailable";
      const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5_000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["EVAL", CLAIM_SCRIPT, "3", ...keys, String(size), String(MAX_UPLOADS), String(MAX_BYTES)]) });
      if (!response.ok) return "unavailable";
      const data = await response.json();
      if (data.error) return "unavailable";
      return data.result === 0 ? "ok" : data.result === 1 ? "replay" : data.result === 2 ? "quota" : "unavailable";
    } catch { return "unavailable"; }
  }
  // Development only. Production must have shared, atomic state and never falls back to process memory.
  for (const [key, until] of localClaims) if (until <= now) localClaims.delete(key);
  for (const [key, quota] of localQuotas) if (quota.until <= now) localQuotas.delete(key);
  if (localClaims.has(keys[0])) return "replay";
  const quota = localQuotas.get(keys[1]) ?? { count: 0, bytes: 0, until: now + 3_600_000 };
  if (quota.count >= MAX_UPLOADS || quota.bytes + size > MAX_BYTES) return "quota";
  if (localClaims.size >= 10_000 || localQuotas.size >= 10_000) return "unavailable";
  localClaims.set(keys[0], now + 300_000);
  localQuotas.set(keys[1], { ...quota, count: quota.count + 1, bytes: quota.bytes + size });
  return "ok";
}
