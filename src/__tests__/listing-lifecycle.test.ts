import { describe, expect, it, vi } from "vitest";
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { QueryClient } from "@tanstack/react-query";
import { custom, decodeFunctionData, encodeErrorResult, hexToString, parseAbi, type Hex } from "viem";
import { listingSchema } from "@/lib/arkiv/schema";
import { rabdiWalletChain } from "@/lib/arkiv/chain";
import { ArkivListingRepository, type ListingMutationClient } from "@/services/listing-repository";
import { verifyListingAction } from "@/services/listing-lifecycle";
import { changeListingCache } from "@/lib/listing-cache";
import { listingKeys } from "@/lib/arkiv/queries";
import { parseListingPrice } from "@/lib/listing-price-input";
import { fixtureListing as listing } from "./fixtures/listing";

const other = "0x2222222222222222222222222222222222222222";
const key = listing.id as Hex;
function setup() {
  const repo = new ArkivListingRepository();
  vi.spyOn(repo, "getById").mockResolvedValue(listing);
  const wallet = {
    account: { address: listing.seller, type: "json-rpc" }, chain: rabdiWalletChain,
    patchEntity: vi.fn().mockResolvedValue({ entityKey: key, txHash: key }),
    extendEntity: vi.fn().mockResolvedValue({ entityKey: key, txHash: key, expiresAt: listing.expiresAtBlock + 302400n }),
    deleteEntity: vi.fn().mockResolvedValue({ entityKey: key, txHash: key }),
  } satisfies ListingMutationClient;
  return { repo, wallet };
}

describe("seller lifecycle ownership and writes", () => {
  it.each(["available", "reserved", "sold"] as const)("patches only status to %s and retains expiration/entity", async (status) => {
    const { repo, wallet } = setup();
    expect((await repo.updateStatus(key, status, wallet)).txHash).toBe(key);
    expect(wallet.patchEntity).toHaveBeenCalledWith(listingSchema, key, { set: { status } });
    expect(wallet.deleteEntity).not.toHaveBeenCalled();
    expect(wallet.extendEntity).not.toHaveBeenCalled();
  });
  it("encodes exact minor units and UTF-8 description", async () => {
    const { repo, wallet } = setup();
    await repo.updateListing(key, { priceMinor: 18446744073709551615n, description: " Updated description " }, wallet);
    const set = wallet.patchEntity.mock.calls[0][2].set!;
    expect(set.priceMinor).toMatchObject({ type: "u64", value: 18446744073709551615n });
    expect(new TextDecoder().decode(set.description as Uint8Array)).toBe("Updated description");
  });
  it.each([7, 14, 30])("adds %i days to the existing deadline, not to the current block", async (days) => {
    const { repo, wallet } = setup();
    await repo.extendExpiry(key, days, wallet);
    expect(wallet.extendEntity).toHaveBeenCalledWith({ entityKey: key,
      expiration: ExpirationTime.atBlock(listing.expiresAtBlock + BigInt(days) * 43200n) });
  });
  it("deletes only after rereading the actual owner", async () => {
    const { repo, wallet } = setup();
    await repo.deleteListing(key, wallet);
    expect(repo.getById).toHaveBeenCalledWith(key);
    expect(wallet.deleteEntity).toHaveBeenCalledWith({ entityKey: key });
  });
  it.each(["status", "edit", "extend", "delete"])("rejects wallet B's %s request before a wallet write", async (kind) => {
    const { repo, wallet } = setup();
    wallet.account.address = other;
    const request = kind === "status" ? repo.updateStatus(key, "sold", wallet) : kind === "edit" ? repo.updateListing(key, { priceMinor: 100n }, wallet) : kind === "extend" ? repo.extendExpiry(key, 7, wallet) : repo.deleteListing(key, wallet);
    await expect(request).rejects.toThrow("Unauthorized");
    expect(wallet.patchEntity).not.toHaveBeenCalled();
    expect(wallet.extendEntity).not.toHaveBeenCalled();
    expect(wallet.deleteEntity).not.toHaveBeenCalled();
  });
  it("blocks missing records, wrong networks, invalid edits and expiry inputs", async () => {
    const { repo, wallet } = setup();
    vi.mocked(repo.getById).mockResolvedValue(null);
    await expect(repo.deleteListing(key, wallet)).rejects.toThrow("missing");
    await expect(repo.updateStatus(key, "sold", { ...wallet, chain: { ...rabdiWalletChain, id: 1 } })).rejects.toThrow("Rabdi");
    await expect(repo.updateListing(key, {}, wallet)).rejects.toThrow("No listing changes");
    await expect(repo.updateListing(key, { priceMinor: -1n }, wallet)).rejects.toThrow();
    await expect(repo.updateListing(key, { priceMinor: 18446744073709551616n }, wallet)).rejects.toThrow();
    await expect(repo.updateListing(key, { description: " " }, wallet)).rejects.toThrow();
    await expect(repo.extendExpiry(key, 0, wallet)).rejects.toThrow();
    expect(wallet.patchEntity).not.toHaveBeenCalled();
  });
  it("serializes the real SDK status patch without deleting or extending", async () => {
    let calldata: Hex | undefined;
    const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_estimateGas") { calldata = (params?.[0] as { data: Hex }).data; throw new Error("stop-before-signing"); }
      if (method === "eth_blockNumber") return "0x64";
      throw new Error(`Unexpected RPC: ${method}`);
    });
    const client = createWalletClient({ account: listing.seller, chain: rabdiWalletChain, transport: custom({ request }, { retryCount: 0 }) });
    const { repo } = setup();
    await expect(repo.updateStatus(key, "sold", client)).rejects.toThrow();
    expect(calldata).toBeDefined();
    const call = decodeFunctionData({ abi: parseAbi(["function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)"]), data: calldata! });
    expect(call.args[0]).toHaveLength(1);
    // Verify the payload contains the actual status key/value using the ABI-independent UTF-8 view.
    expect(hexToString(call.args[0][0].operationData)).toContain("sold");
    expect(request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });
  it("decodes a protocol NotOwner response through the real SDK without broadcasting", async () => {
    const data = encodeErrorResult({ abi: parseAbi(["error NotOwner(bytes32 entityKey, address caller, address owner)"]),
      errorName: "NotOwner", args: [key, other, listing.owner] });
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_estimateGas") throw Object.assign(new Error("execution reverted"), { code: 3, data });
      throw new Error(`Unexpected RPC: ${method}`);
    });
    const client = createWalletClient({ account: other, chain: rabdiWalletChain, transport: custom({ request }, { retryCount: 0 }) });
    await expect(client.deleteEntity({ entityKey: key })).rejects.toThrow(/owned by.*not /i);
    expect(request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });

  it("queries seller ownership and all statuses across raw pages", async () => {
    const request = vi.fn().mockResolvedValue({ data: [], blockNumber: "0x64" });
    const repo = new ArkivListingRepository(createPublicClient({ chain: rabdiWalletChain, transport: custom({ request }, { retryCount: 0 }) }));
    expect(await repo.searchOwned(listing.seller)).toEqual([]);
    const query = request.mock.calls[0][0].params[0];
    expect(query).toContain(`$owner = addr(${listing.seller})`);
    expect(query).toContain(`seller = addr(${listing.seller})`);
    expect(query).not.toContain("status =");
  });
});

describe("optimistic cache and indexing", () => {
  it("removes a reserved listing from buyer results, retains seller/detail, and rolls back without losing unrelated edits", () => {
    const cache = new QueryClient();
    const catalog = listingKeys.catalog();
    const owned = [...listingKeys.all, "owned", listing.seller.toLowerCase()];
    const second = { ...listing, id: "second", title: "Second" };
    cache.setQueryData(catalog, [listing, second]);
    cache.setQueryData(owned, [listing]);
    const undo = changeListingCache(cache, key, { ...listing, status: "reserved" });
    expect(cache.getQueryData(catalog)).toEqual([second]);
    expect(cache.getQueryData(owned)).toEqual([{ ...listing, status: "reserved" }]);
    cache.setQueryData(catalog, [{ ...second, title: "Updated independently" }]);
    undo();
    expect(cache.getQueryData(catalog)).toEqual([listing, { ...second, title: "Updated independently" }]);
    expect(cache.getQueryData(owned)).toEqual([listing]);
    cache.clear();
  });
  it("removes a deleted listing from every array and its detail", () => {
    const cache = new QueryClient();
    cache.setQueryData(listingKeys.search({ status: "all" }), [listing]);
    cache.setQueryData(listingKeys.detail(key), listing);
    const undo = changeListingCache(cache, key, null);
    expect(cache.getQueryData(listingKeys.search({ status: "all" }))).toEqual([]);
    expect(cache.getQueryData(listingKeys.detail(key))).toBeNull();
    undo();
    expect(cache.getQueryData(listingKeys.detail(key))).toEqual(listing);
    cache.clear();
  });
  it("retries stale reads only and waits for the requested status", async () => {
    const getById = vi.fn().mockResolvedValueOnce(listing).mockResolvedValue({ ...listing, status: "sold" });
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await verifyListingAction(key, { kind: "status", status: "sold" }, undefined, { getById }, wait)).toEqual({ ...listing, status: "sold" });
    expect(wait).toHaveBeenCalledOnce();
    getById.mockResolvedValue(null);
    expect(await verifyListingAction(key, { kind: "delete" }, undefined, { getById }, wait)).toBeNull();
  });
  it("reports delayed indexing without treating it as an unconfirmed wallet write", async () => {
    const getById = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await verifyListingAction(key, { kind: "delete" }, undefined, { getById }, async () => {})).toBeUndefined();
    expect(getById).toHaveBeenCalledTimes(5);
  });
  it("parses prices exactly, including uint64 boundary, and rejects fractional paisa", () => {
    expect(parseListingPrice("184467440737095516.15")).toBe(18446744073709551615n);
    expect(parseListingPrice("0")).toBe(0n);
    for (const value of ["1.005", "-1", "NaN", "184467440737095516.16"]) expect(() => parseListingPrice(value)).toThrow();
  });
});
