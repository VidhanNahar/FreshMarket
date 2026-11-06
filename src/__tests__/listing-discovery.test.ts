import { describe, expect, it, vi } from "vitest";
import type { Listing } from "@/domain/listing";
import {
  discoverListings, discoveryFallback, discoveryQuery, expirationLabel, fetchDiscoveryCandidates, isEntityKey,
  parseDiscoveryFilters, planDiscovery, type DiscoveryFilters,
} from "@/lib/listing-discovery";
import { fixtureListing as base } from "./fixtures/listing";

const filters: DiscoveryFilters = { q: "", category: "", city: "", condition: "", fulfilment: "", minPrice: "", maxPrice: "", sort: "newest" };
const chewBall: Listing = { ...base, id: "ball", title: "Acme Rubber Chew Ball", description: "Tough and bouncy", categoryPath: "pets/dogs/toys", brand: "acme", model: "" };
const laptop: Listing = { ...base, id: "laptop", title: "ThinkPad T14 laptop", description: "2022, small dent", categoryPath: "electronics/computers/laptops", brand: "lenovo", model: "thinkpadt14" };

describe("discovery URL state", () => {
  it("round trips shareable filters including special characters", () => {
    const value: DiscoveryFilters = { ...filters, q: "phone & case", category: "electronics/phones", city: "New Delhi", condition: "like-new", fulfilment: "ship", minPrice: "5", maxPrice: "20.5", sort: "price-desc" };
    expect(parseDiscoveryFilters(new URLSearchParams(discoveryQuery(value)))).toEqual(value);
  });
  it("clears defaults and drops unknown categories, conditions and sorts", () => {
    expect(discoveryQuery(filters)).toBe("");
    expect(parseDiscoveryFilters(new URLSearchParams("sort=invalid&city=%20Mumbai%20&category=nope&condition=broken")))
      .toEqual({ ...filters, city: "Mumbai" });
  });
});

describe("discovery plan: queries become indexed Arkiv filters", () => {
  it("resolves dogtoy to the dog-toy category with no leftover text", () => {
    const plan = planDiscovery({ ...filters, q: "dogtoy", city: "Mumbai" });
    expect(plan.arkiv).toMatchObject({ categoryPaths: ["pets/dogs/toys"], city: "Mumbai" });
    expect(plan.textWords).toEqual([]);
  });
  it("keeps unrecognized words for text matching and converts USDT price bounds", () => {
    const plan = planDiscovery({ ...filters, q: "red dog toy", minPrice: "5", maxPrice: "12.5" });
    expect(plan.textWords).toEqual(["red"]);
    expect(plan.arkiv).toMatchObject({ minPriceMinor: 5_000_000n, maxPriceMinor: 12_500_000n });
  });
  it("narrows a picked category with a query inside it, and treats one outside it as text", () => {
    expect(planDiscovery({ ...filters, category: "pets", q: "dog toy" }).arkiv.categoryPaths).toEqual(["pets/dogs/toys"]);
    const outside = planDiscovery({ ...filters, category: "books", q: "dog toy" });
    expect(outside.arkiv.categoryPaths).toEqual(["books"]);
    expect(outside.textWords).toEqual(["dog", "toy"]);
  });
  it("ignores an inverted price range rather than returning nothing", () => {
    expect(planDiscovery({ ...filters, minPrice: "10", maxPrice: "5" }).arkiv.maxPriceMinor).toBeUndefined();
  });
});

describe("candidate fetching", () => {
  it("falls back one category level when the requested branch is empty", async () => {
    const searchAll = vi.fn().mockResolvedValueOnce({ listings: [], truncated: false })
      .mockResolvedValueOnce({ listings: [{ ...base, categoryPath: "pets/dogs/beds" }], truncated: false });
    const plan = planDiscovery({ ...filters, q: "dogtoy" });
    const { listings: rows } = await fetchDiscoveryCandidates(plan, searchAll);
    expect(searchAll.mock.calls[1][0].categoryPaths).toEqual(["pets/dogs"]);
    expect(discoveryFallback(plan, rows)).toBe("pets/dogs");
    expect(discoveryFallback(plan, [chewBall])).toBeUndefined();
  });
  it("tries unrecognized words as a brand or model key before a broad read", async () => {
    const searchAll = vi.fn().mockResolvedValueOnce({ listings: [laptop], truncated: false });
    await fetchDiscoveryCandidates(planDiscovery({ ...filters, q: "lenovo" }), searchAll);
    expect(searchAll).toHaveBeenCalledWith({ brandOrModel: "lenovo" });
    const empty = vi.fn().mockResolvedValue({ listings: [], truncated: false });
    await fetchDiscoveryCandidates(planDiscovery({ ...filters, q: "zzz" }), empty);
    expect(empty.mock.calls.map(([arkiv]) => arkiv)).toEqual([{ brandOrModel: "zzz" }, {}]);
  });
});

describe("discovery ranking and sort", () => {
  it("finds items by category even when the title never says the query", () => {
    expect(discoverListings([chewBall], planDiscovery({ ...filters, q: "dogtoy" }).textWords, "newest")).toEqual([chewBall]);
  });
  it("matches descriptions, typos and run-together words, and preserves the input array", () => {
    const rows = [base, laptop];
    expect(discoverListings(rows, ["dent"], "newest")).toEqual([laptop]);
    expect(discoverListings(rows, ["thinkpd"], "newest")).toEqual([laptop]);
    expect(discoverListings(rows, ["woodendesk"], "newest")).toEqual([base]);
    expect(rows[0]).toBe(base);
  });
  it("ranks title matches first, then newest", () => {
    const inTitle = { ...base, id: "title", title: "Blue lamp", createdAtBlock: 1n };
    const inBody = { ...base, id: "body", title: "Lamp shade", description: "blue fabric", createdAtBlock: 9n };
    expect(discoverListings([inBody, inTitle], ["blue"], "newest").map((row) => row.id)).toEqual(["title", "body"]);
    expect(discoverListings([inTitle, inBody], [], "newest").map((row) => row.id)).toEqual(["body", "title"]);
  });
  it("sorts uint64 prices precisely without losing digits to number conversion", () => {
    const lower = { ...base, id: "lower", priceMinor: 18446744073709551614n };
    const upper = { ...base, id: "upper", priceMinor: 18446744073709551615n };
    expect(discoverListings([upper, lower], [], "price-asc")).toEqual([lower, upper]);
    expect(discoverListings([lower, upper], [], "price-desc")).toEqual([upper, lower]);
  });
});

describe("block expiration and entity keys", () => {
  it("does not treat block heights as Unix timestamps", () => {
    expect(expirationLabel(110n)).toBe("Expires at block 110");
    expect(expirationLabel(110n, 110n)).toBe("Expired");
    expect(expirationLabel(110n, 111n)).toBe("Expired");
    expect(expirationLabel(110n, 100n)).toContain("less than a minute");
    expect(expirationLabel(1900n, 100n)).toContain("~1 hours");
    expect(expirationLabel(43300n, 100n)).toContain("~1 days");
  });
  it("rejects malformed detail links", () => {
    expect(isEntityKey(base.id)).toBe(true);
    expect(isEntityKey("0x123")).toBe(false);
    expect(isEntityKey("invalid")).toBe(false);
  });
});
