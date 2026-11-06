import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  getListingById, getListingReadErrorMessage, invalidateListings, listingKeys,
  listingQueryOptions, listingReadPolicy, listingsQueryOptions,
} from "@/lib/arkiv/queries";
import { listingRepository } from "@/services/listing-repository";

afterEach(() => vi.restoreAllMocks());

describe("Public listing query cache", () => {
  it("reads without wallet access, deduplicates concurrent queries, and caches for 30 seconds", async () => {
    const read = vi.spyOn(listingRepository, "search").mockResolvedValue([]);
    const cache = new QueryClient();
    const options = listingsQueryOptions({ minPriceMinor: 0n, maxPriceMinor: 5000n });
    expect(await Promise.all([cache.fetchQuery(options), cache.fetchQuery(options)])).toEqual([[], []]);
    await cache.fetchQuery(options);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith({ minPriceMinor: 0n, maxPriceMinor: 5000n });
    expect(options.staleTime).toBe(30_000);
    cache.clear();
  });

  it("invalidates catalog, seller and detail data while retaining unrelated queries", async () => {
    const cache = new QueryClient();
    const catalog = listingKeys.search();
    const seller = listingKeys.search({ seller: "0x1234", status: "all" });
    const detail = listingKeys.detail("0xabcd");
    for (const key of [catalog, seller, detail, ["unrelated"]]) cache.setQueryData(key, []);
    await invalidateListings(cache);
    for (const key of [catalog, seller, detail]) expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    expect(cache.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
    cache.clear();
  });

  it("uses JSON-safe distinct price keys and canonical entity IDs", () => {
    expect(() => JSON.stringify(listingKeys.search({ minPriceMinor: 1n }))).not.toThrow();
    expect(listingKeys.search({ minPriceMinor: 1n })).not.toEqual(listingKeys.search({ minPriceMinor: 2n }));
    expect(listingKeys.detail("0xABCD")).toEqual(listingKeys.detail("0xabcd"));
    expect(listingQueryOptions("").enabled).toBe(false);
  });

  it("keeps empty/missing results separate from read failures", async () => {
    const get = vi.spyOn(listingRepository, "getById").mockResolvedValue(null);
    expect(await getListingById("0xabcd")).toBeNull();
    get.mockRejectedValue(new Error("offline"));
    await expect(getListingById("0xabcd")).rejects.toThrow("offline");
  });

  it("retries transient failures only and gives safe error messages", () => {
    const rateLimited = { name: "HttpRequestError", cause: { status: 429 } };
    expect(listingReadPolicy.retry(0, rateLimited)).toBe(true);
    expect(listingReadPolicy.retry(2, rateLimited)).toBe(false);
    expect(listingReadPolicy.retry(0, new Error("Invalid entity key"))).toBe(false);
    expect(getListingReadErrorMessage(rateLimited)).toContain("busy");
    expect(getListingReadErrorMessage(new TypeError("fetch failed"))).toContain("connection");
    expect(getListingReadErrorMessage(new Error("secret-access-key"))).not.toContain("secret-access-key");
  });
});
