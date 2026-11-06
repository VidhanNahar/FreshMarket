import { createHash } from "node:crypto";
import { isAddress, verifyMessage, type Hex } from "viem";
import { MAX_IMAGE_BYTES, IMAGE_TYPES, uploadAuthorization, validImageBytes } from "@/lib/swarm/protocol";

export const runtime = "nodejs";
export const maxDuration = 90;
const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const endpoint = process.env.SWARM_BEE_URL;
  const batch = process.env.SWARM_POSTAGE_BATCH_ID;
  const allowed = (process.env.SWARM_UPLOAD_ALLOWED_WALLETS ?? "").toLowerCase().split(",").map((value) => value.trim()).filter(Boolean);
  if (!endpoint || !/^[a-fA-F0-9]{64}$/.test(batch ?? "") || !allowed.length) return fail("Swarm uploads are not configured. You can still use an HTTPS image URL.", 503);
  let bee: URL;
  try {
    bee = new URL(endpoint);
    if (bee.username || bee.password || bee.search || bee.hash || !["http:", "https:"].includes(bee.protocol)) throw new Error();
    if (bee.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(bee.hostname)) throw new Error();
  } catch { return fail("Swarm upload configuration is invalid", 503); }
  const origin = process.env.SWARM_ALLOWED_ORIGIN ?? (process.env.NODE_ENV !== "production" ? new URL(request.url).origin : "");
  if (!origin || request.headers.get("origin") !== origin) return fail("Upload origin is not allowed", 403);
  const wallet = request.headers.get("x-upload-wallet") ?? "";
  if (!isAddress(wallet) || !allowed.includes(wallet.toLowerCase())) return fail("This wallet is not enabled for Swarm uploads", 403);
  const timestamp = Number(request.headers.get("x-upload-time"));
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 120_000) return fail("Upload authorization expired. Select the image again.", 401);
  const type = request.headers.get("content-type") ?? "";
  if (!(IMAGE_TYPES as readonly string[]).includes(type)) return fail("Only PNG, JPEG and WebP images are supported", 415);
  if (Number(request.headers.get("content-length")) > MAX_IMAGE_BYTES) return fail("Image exceeds 4 MiB", 413);
  // Bound the streamed body even when Content-Length is absent or untrusted.
  const reader = request.body?.getReader();
  if (!reader) return fail("No image supplied", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > MAX_IMAGE_BYTES) { await reader.cancel(); return fail("Image exceeds 4 MiB", 413); }
      chunks.push(part.value);
    }
  } catch { return fail("Image upload was interrupted", 400); }
  const bytes = Buffer.concat(chunks);
  if (!size || !validImageBytes(bytes, type)) return fail("File contents do not match the selected image type", 415);
  const signature = request.headers.get("x-upload-signature") ?? "";
  try {
    const message = uploadAuthorization(origin, createHash("sha256").update(bytes).digest("hex"), type, size, timestamp);
    if (!await verifyMessage({ address: wallet, message, signature: signature as Hex })) return fail("Upload signature is invalid", 401);
  } catch { return fail("Upload signature is invalid", 401); }
  try {
    const response = await fetch(`${bee.href.replace(/\/$/, "")}/bzz?name=product-image`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": type, "swarm-postage-batch-id": batch!, "swarm-pin": "true", "swarm-deferred-upload": "false",
        ...(process.env.SWARM_BEE_API_KEY ? { Authorization: `Bearer ${process.env.SWARM_BEE_API_KEY}` } : {}) },
      body: bytes,
    });
    if (!response.ok) return fail("Bee rejected the upload. Check postage batch validity, capacity and node connectivity.", 502);
    const result = await response.json();
    if (!/^[a-fA-F0-9]{64}$/.test(result.reference ?? "")) return fail("Bee returned an invalid public reference", 502);
    return Response.json({ reference: result.reference.toLowerCase() });
  } catch { return fail("Swarm node unavailable or upload timed out. No listing was published.", 502); }
}
