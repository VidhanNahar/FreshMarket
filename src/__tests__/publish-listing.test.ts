import { describe, expect, it, vi } from "vitest";
import { createWalletClient as createViemWalletClient, custom, type Hex } from "viem";
import type { CreateListingInput, Listing } from "@/domain/listing";
import { rabdiWalletChain } from "@/lib/arkiv/chain";
import { createListingWalletClient } from "@/lib/arkiv/wallet";
import { publishListing, verifyPublishedListing } from "@/services/publish-listing";
import type { ListingWalletClient } from "@/services/listing-repository";

const seller = "0x1111111111111111111111111111111111111111";
const key = `0x${"ab".repeat(32)}` as Hex;
const receipt = { entityKey: key, txHash: key, expiresAt: 302500n };
const input: CreateListingInput = {
  seller, title: "Used desk", description: "Good condition", price: 500,
  imageUrl: "https://example.com/desk.png", category: "Furniture", city: "Mumbai",
};
const listing: Listing = {
  ...input, id: key, priceMinor: 50000n, currency: "INR", status: "available",
  owner: seller, createdAt: 1700000000000, expiresAtBlock: receipt.expiresAt,
};
const wallet: ListingWalletClient = {
  account: { address: seller, type: "json-rpc" }, chain: rabdiWalletChain,
  createEntity: vi.fn().mockResolvedValue(receipt),
};

describe("Listing write and public verification", () => {
  it("confirms once, then reads through a separate repository without wallet prompts", async () => {
    const repo = { createWithReceipt: vi.fn().mockResolvedValue(receipt), getById: vi.fn().mockResolvedValue(listing) };
    const confirmed = vi.fn();
    expect(await publishListing(input, wallet, confirmed, repo)).toEqual({ receipt, listing });
    expect(repo.createWithReceipt).toHaveBeenCalledTimes(1);
    expect(confirmed).toHaveBeenCalledWith(receipt);
    expect(repo.getById).toHaveBeenCalledWith(key);
    expect(confirmed.mock.invocationCallOrder[0]).toBeLessThan(repo.getById.mock.invocationCallOrder[0]);
  });

  it("retries indexing misses/network failures with bounded delays and never recreates", async () => {
    const getById = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("RPC offline")).mockResolvedValue(listing);
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await verifyPublishedListing(key, { getById }, wait)).toBe(listing);
    expect(wait.mock.calls).toEqual([[500], [1000]]);
    expect(getById).toHaveBeenCalledTimes(3);
  });

  it("returns a delayed verification outcome after five attempts", async () => {
    const getById = vi.fn().mockRejectedValue(new Error("rate limited"));
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await verifyPublishedListing(key, { getById }, wait)).toBeNull();
    expect(getById).toHaveBeenCalledTimes(5);
    expect(wait.mock.calls).toEqual([[500], [1000], [2000], [4000]]);
  });

  it("does not retry rejected writes or attempt public verification", async () => {
    const error = new Error("User rejected request");
    const repo = { createWithReceipt: vi.fn().mockRejectedValue(error), getById: vi.fn() };
    const confirmed = vi.fn();
    await expect(publishListing(input, wallet, confirmed, repo)).rejects.toBe(error);
    expect(repo.createWithReceipt).toHaveBeenCalledTimes(1);
    expect(repo.getById).not.toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
  });
});

describe("Connected wallet adapter", () => {
  function provider(chainId: number = rabdiWalletChain.id) {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      if (method === "eth_sendTransaction") return key;
      throw new Error(`Unexpected method: ${method}`);
    });
    return { request, client: createViemWalletClient({ account: seller, chain: rabdiWalletChain, transport: custom({ request }, { retryCount: 0 }) }) };
  }

  it("reuses Wagmi's account/provider and reports signature before submitted hash", async () => {
    const { client } = provider();
    const states: string[] = [];
    const adapted = await createListingWalletClient(client, {
      onSignatureRequested: () => states.push("signature"),
      onSubmitted: (hash) => states.push(hash),
    });
    expect(adapted.account?.address).toBe(seller);
    expect(typeof adapted.createEntity).toBe("function");
    await adapted.transport.request({ method: "eth_sendTransaction", params: [{ from: seller }] });
    expect(states).toEqual(["signature", key]);
  });

  it("rejects a provider network mismatch even if Wagmi metadata says Rabdi", async () => {
    const { client } = provider(1);
    await expect(createListingWalletClient(client)).rejects.toThrow("Switch your wallet");
  });

  it("never retries a failed provider send or reports a false pending hash", async () => {
    const { client, request } = provider();
    const submitted = vi.fn();
    const adapted = await createListingWalletClient(client, { onSubmitted: submitted });
    request.mockClear();
    request.mockRejectedValue(Object.assign(new Error("User rejected request"), { code: 4001 }));
    await expect(adapted.transport.request({ method: "eth_sendTransaction", params: [{ from: seller }] })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
  });
});
