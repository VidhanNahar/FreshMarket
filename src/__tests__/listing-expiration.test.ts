import { describe, expect, it, vi } from "vitest";
import { createPublicClient } from "@arkiv-network/sdk";
import { custom } from "viem";
import { estimateListingExpiration } from "@/lib/arkiv/expiration";
import { rabdiWalletChain } from "@/lib/arkiv/chain";

// Feed raw block responses through the SDK/Viem formatter rather than mocking its return type.
function reader() {
  const request = vi.fn()
    .mockResolvedValueOnce({ number: "0x64", timestamp: "0x3e8" })
    .mockResolvedValueOnce({ number: "0x5a", timestamp: "0x3d4" });
  const client = createPublicClient({ chain: rabdiWalletChain, transport: custom({ request }, { retryCount: 0 }) });
  return { client, request };
}

describe("Display-only expiration estimate", () => {
  it("uses observed chain timing and returns Unix milliseconds", async () => {
    const { client } = reader();
    // Current block 100 at second 1000; previous 10 blocks took 20 seconds.
    expect(await estimateListingExpiration(110n, client)).toBe(1_020_000);
  });

  it("returns null on RPC failures without invalidating a confirmed write", async () => {
    const { client, request } = reader();
    request.mockReset().mockRejectedValue(new Error("offline"));
    expect(await estimateListingExpiration(110n, client)).toBeNull();
  });

  it("does not invent an estimate when observed block times do not advance", async () => {
    const { client, request } = reader();
    request.mockReset().mockResolvedValue({ number: "0x64", timestamp: "0x3e8" });
    expect(await estimateListingExpiration(110n, client)).toBeNull();
  });
});
