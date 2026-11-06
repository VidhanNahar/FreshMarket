import { afterEach, describe, expect, it, vi } from "vitest";
import { claimUpload } from "@/lib/swarm/upload-state";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("atomic upload replay and quota claims", () => {
  it("limits both request count and byte usage per wallet", async () => {
    const wallet = "quota-test-wallet";
    for (let i = 0; i < 32; i++) expect(await claimUpload(`unique-count-${i}`, wallet, 1)).toBe("ok");
    expect(await claimUpload("one-too-many", wallet, 1)).toBe("quota");
    expect(await claimUpload("unique-count-0", wallet, 1)).toBe("replay");
    const bytesWallet = "byte-quota-wallet";
    for (let i = 0; i < 4; i++) expect(await claimUpload(`unique-bytes-${i}`, bytesWallet, 4 * 1024 * 1024)).toBe("ok");
    expect(await claimUpload("byte-overflow", bytesWallet, 1)).toBe("quota");
  });
  it("uses one atomic Redis script in production and interprets replay/quota responses", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SWARM_UPLOAD_STATE_URL", "https://redis.example.test"); vi.stubEnv("SWARM_UPLOAD_STATE_TOKEN", "test-token");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ result: 0 }))
      .mockResolvedValueOnce(Response.json({ result: 1 })).mockResolvedValueOnce(Response.json({ result: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await claimUpload("message", "wallet", 8)).toBe("ok");
    expect(await claimUpload("message", "wallet", 8)).toBe("replay");
    expect(await claimUpload("message-2", "wallet", 8)).toBe("quota");
    const command = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(command[0]).toBe("EVAL");
    expect(command[2]).toBe("3");
    expect(command.slice(3, 6).every((key: string) => key.includes("{wallet}"))).toBe(true);
  });
  it("never falls back to memory when the production store is missing, malformed or offline", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SWARM_UPLOAD_STATE_URL", ""); vi.stubEnv("SWARM_UPLOAD_STATE_TOKEN", "");
    expect(await claimUpload("one", "wallet", 8)).toBe("unavailable");
    vi.stubEnv("SWARM_UPLOAD_STATE_URL", "http://redis.example.test"); vi.stubEnv("SWARM_UPLOAD_STATE_TOKEN", "test");
    expect(await claimUpload("two", "wallet", 8)).toBe("unavailable");
    vi.stubEnv("SWARM_UPLOAD_STATE_URL", "https://redis.example.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await claimUpload("three", "wallet", 8)).toBe("unavailable");
  });
});
