import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { POST } from "@/app/api/swarm/upload/route";
import { uploadAuthorization } from "@/lib/swarm/protocol";
import { resolveImageSource, swarmReference } from "../../shared/media";
import { expiryDemoPreset } from "@/domain/expiry-demo";
import { listingFormSchema } from "@/domain/listing-schema";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const origin = "http://localhost:3000";
const reference = "ab".repeat(32);
const image = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("SWARM_BEE_URL", "https://bee.example.test");
  vi.stubEnv("SWARM_POSTAGE_BATCH_ID", "cd".repeat(32));
  vi.stubEnv("SWARM_UPLOAD_ALLOWED_WALLETS", account.address);
  vi.stubEnv("SWARM_ALLOWED_ORIGIN", origin);
  fetchMock = vi.fn().mockResolvedValue(Response.json({ reference }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
let previousAuthorizationTime = 0;
async function request(patch: Record<string, string> = {}, body = image) {
  const time = Math.max(Date.now(), previousAuthorizationTime + 1);
  previousAuthorizationTime = time;
  const hash = createHash("sha256").update(body).digest("hex");
  const signature = await account.signMessage({ message: uploadAuthorization(origin, hash, "image/png", body.length, time) });
  return new Request(`${origin}/api/swarm/upload`, { method: "POST", headers: {
    origin, "content-type": "image/png", "x-upload-wallet": account.address,
    "x-upload-digest": hash, "x-upload-bytes": String(body.length),
    "x-upload-time": String(time), "x-upload-signature": signature, ...patch,
  }, body: body.slice().buffer });
}

describe("Swarm media reference contract", () => {
  it("renders copied Swarm viewer links as direct images, including existing listings", () => {
    expect(resolveImageSource(`https://gateway.ethswarm.org/access/${reference}`)).toBe(`https://api.gateway.ethswarm.org/bzz/${reference}/`);
    expect(resolveImageSource(`https://gateway.testnet.ethswarm.org/access/${reference}/photo.png`)).toBe(`https://api.gateway.testnet.ethswarm.org/bzz/${reference}/photo.png`);
    expect(resolveImageSource(`https://gateway.ethswarm.org/bzz/${reference}/`)).toBe(`https://api.gateway.ethswarm.org/bzz/${reference}/`);
    expect(resolveImageSource(`https://example.com/access/${reference}`)).toBe(`https://example.com/access/${reference}`);
    expect(resolveImageSource(`https://gateway.ethswarm.org/access/${"ab".repeat(64)}`)).toBeNull();
  });
  it("resolves immutable public references and preserves legacy HTTPS images", () => {
    expect(swarmReference(`bzz://${reference.toUpperCase()}`)).toBe(reference);
    expect(resolveImageSource(`bzz://${reference}`)).toBe(`https://api.gateway.ethswarm.org/bzz/${reference}/`);
    expect(resolveImageSource("https://example.com/desk.png")).toBe("https://example.com/desk.png");
    for (const value of ["javascript:alert(1)", "http://example.com/x", `bzz://${"a".repeat(128)}`, "bzz://not-a-reference", "https://user:secret@example.com/image"]) expect(resolveImageSource(value)).toBeNull();
  });
  it("allows public Swarm references in the publishing schema and rejects encrypted references", () => {
    expect(listingFormSchema.safeParse({ ...expiryDemoPreset, imageUrl: `bzz://${reference}` }).success).toBe(true);
    expect(listingFormSchema.safeParse({ ...expiryDemoPreset, imageUrl: `bzz://${"ab".repeat(64)}` }).success).toBe(false);
  });
});

describe("authorized Swarm upload proxy", () => {
  it("bounds a stalled authenticated body without contacting Bee", async () => {
    const signed = await request();
    vi.useFakeTimers();
    let started!: () => void;
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(signed.body!, "getReader").mockReturnValue({
      read: () => { started(); return new Promise(() => {}); }, cancel,
    } as unknown as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>);
    const pending = POST(signed);
    await reading;
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await pending).status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("authenticates before reading an untrusted request body", async () => {
    const unsigned = await request({ "x-upload-signature": "0x00" });
    const read = vi.spyOn(unsigned.body!, "getReader");
    expect((await POST(unsigned)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects streamed bytes that exceed or differ from the signed body", async () => {
    const signed = await request();
    const oversized = new Request(signed.url, { method: "POST", headers: signed.headers, body: new Uint8Array(9) });
    expect((await POST(oversized)).status).toBe(413);
    const altered = await request();
    const body = image.slice(); body[7] = 0;
    const tampered = new Request(altered.url, { method: "POST", headers: altered.headers, body });
    expect((await POST(tampered)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("claims a signed upload once, including concurrent replay attempts", async () => {
    const signed = await request();
    const results = await Promise.all([POST(signed.clone()), POST(signed.clone())]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("fails closed in production without a shared replay/quota store", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SWARM_UPLOAD_STATE_URL", "");
    vi.stubEnv("SWARM_UPLOAD_STATE_TOKEN", "");
    expect((await POST(await request())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards validated image bytes to Bee and returns its real response reference", async () => {
    const result = await POST(await request());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ reference });
    expect(fetchMock).toHaveBeenCalledWith("https://bee.example.test/bzz?name=product-image", expect.objectContaining({ method: "POST", redirect: "error", headers: expect.objectContaining({ "swarm-postage-batch-id": "cd".repeat(32), "Content-Type": "image/png" }) }));
  });
  it("fails closed when postage or allowed-wallet configuration is missing", async () => {
    vi.stubEnv("SWARM_POSTAGE_BATCH_ID", "");
    expect((await POST(await request())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [{ origin: "https://attacker.example" }, 403],
    [{ "x-upload-wallet": "0x2222222222222222222222222222222222222222" }, 403],
    [{ "x-upload-signature": "0x00" }, 401],
    [{ "x-upload-time": "1" }, 401],
    [{ "content-type": "image/svg+xml" }, 415],
    [{ "content-length": "5000000" }, 413],
  ] as const)("rejects unauthorized/invalid requests before contacting Bee: %j", async (headers, status) => {
    expect((await POST(await request(headers))).status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects mismatched file bytes", async () => {
    expect((await POST(await request({}, new Uint8Array([1, 2, 3])))).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not invent a reference or leak Bee errors when upload fails", async () => {
    fetchMock.mockRejectedValue(new Error("private Bee token and endpoint"));
    const result = await POST(await request());
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain("private Bee token");
  });
});
