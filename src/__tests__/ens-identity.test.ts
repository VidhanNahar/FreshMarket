import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { decodeFunctionData, encodeFunctionResult, zeroAddress, type Address } from "viem";
import { ensConfig } from "@/lib/ens/config";
import { resolverProfileAbi } from "@/lib/ens/contracts";
import { publicHttpsUrl, storefrontLabel } from "@/lib/ens/names";
import { resolveSellerIdentity, type EnsReader } from "@/services/ens-identity";
import { ensIdentityKeys, sellerIdentityOptions } from "@/hooks/use-seller-identity";
import { listingKeys } from "@/lib/arkiv/queries";

const seller = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const registry = "0x3333333333333333333333333333333333333333";
function fixture(options: { candidate?: string; owner?: Address; forward?: Address; metadataFailure?: boolean; status?: number; avatar?: string } = {}) {
  const readContract = vi.fn();
  const client = {
    readContract, getBlockNumber: vi.fn().mockResolvedValue(100n),
    getBlock: vi.fn(), getCode: vi.fn(),
  } satisfies EnsReader;
  readContract.mockImplementation(async ({ functionName, args }) => {
    if (functionName === "ROOT_REGISTRY") return ensConfig.rootRegistry;
    if (functionName === "reverse") return [options.candidate ?? "alice.market.eth", zeroAddress, zeroAddress];
    if (functionName === "getSubregistry") return args[0] === "eth" ? ensConfig.ethRegistry : registry;
    if (functionName === "getState") return { status: options.status ?? 2, latestOwner: options.owner ?? seller, expiry: 9999999999n, tokenId: 77n, resource: 88n };
    if (functionName === "ownerOf") return options.owner ?? seller;
    if (functionName === "resolve") {
      const profile = decodeFunctionData({ abi: resolverProfileAbi, data: args[1] });
      if (profile.functionName === "addr") return [encodeFunctionResult({ abi: resolverProfileAbi, functionName: "addr", result: options.forward ?? seller }), zeroAddress];
      if (options.metadataFailure) throw new Error("metadata rate limited");
      const text = profile.args[1] === "avatar" ? (options.avatar ?? "https://example.com/avatar.png") : profile.args[1] === "url" ? "https://example.com/store" : "Second-hand books";
      return [encodeFunctionResult({ abi: resolverProfileAbi, functionName: "text", result: text }), zeroAddress];
    }
    throw new Error(`Unexpected method: ${functionName}`);
  });
  return client;
}

afterEach(() => vi.restoreAllMocks());
describe("Verified ENSv2 identity", () => {
  it("checks reverse, current hierarchical ownership and forward address at one block", async () => {
    const client = fixture();
    const identity = await resolveSellerIdentity(seller, client);
    expect(identity).toMatchObject({ name: "alice.market.eth", address: seller, verifiedAtBlock: 100n, description: "Second-hand books" });
    expect(identity?.avatar).toBe("https://example.com/avatar.png");
    expect(client.readContract.mock.calls.every(([call]) => call.blockNumber === 100n)).toBe(true);
    expect(client.readContract.mock.calls.some(([call]) => call.address === registry && call.functionName === "ownerOf")).toBe(true);
  });

  it.each<NonNullable<Parameters<typeof fixture>[0]>>([
    { owner: other }, { forward: other }, { status: 0 }, { status: 1 },
    { candidate: "" }, { candidate: "not a valid ENS name!" },
  ])("rejects unverified identity claims: %j", async (options) => {
    expect(await resolveSellerIdentity(seller, fixture(options))).toBeNull();
  });

  it("keeps verified ownership when optional metadata fails and sanitizes avatar URLs", async () => {
    expect(await resolveSellerIdentity(seller, fixture({ metadataFailure: true }))).toMatchObject({ name: "alice.market.eth", avatar: null, description: null, url: null });
    expect((await resolveSellerIdentity(seller, fixture({ avatar: "javascript:alert(1)" })))?.avatar).toBeNull();
  });

  it("propagates RPC errors for the independent identity query to handle", async () => {
    const client = fixture(); client.getBlockNumber.mockRejectedValue(new Error("ENS offline"));
    await expect(resolveSellerIdentity(seller, client)).rejects.toThrow("ENS offline");
  });

  it("bounds handles and URL schemes", () => {
    expect(storefrontLabel("Alice-1")).toBe("alice-1");
    for (const invalid of ["a.b", "-alice", "alice-", "a".repeat(33)]) expect(() => storefrontLabel(invalid)).toThrow();
    expect(publicHttpsUrl("https://user:secret@example.com")).toBeNull();
    expect(publicHttpsUrl("data:image/svg+xml,...")).toBeNull();
  });
});

describe("ENS cache isolation", () => {
  it("deduplicates and caches identity independently from Arkiv and never auto-retries", async () => {
    const cache = new QueryClient();
    const queryFn = vi.fn().mockResolvedValue(null);
    const options = { ...sellerIdentityOptions(seller), queryFn };
    await Promise.all([cache.fetchQuery(options), cache.fetchQuery(options)]);
    expect(queryFn).toHaveBeenCalledTimes(1);
    cache.setQueryData(listingKeys.search(), []);
    await cache.invalidateQueries({ queryKey: ensIdentityKeys.all });
    expect(cache.getQueryState(listingKeys.search())?.isInvalidated).toBe(false);
    expect(options.retry).toBe(false);
    expect(options.staleTime).toBe(60_000);
    expect(sellerIdentityOptions("invalid").enabled).toBe(false);
    cache.clear();
  });
});
