import { describe, expect, it } from "vitest";
import { discoverListings, discoveryQuery, expirationLabel, isEntityKey, parseDiscoveryFilters } from "@/lib/listing-discovery";
import { fixtureListing as base } from "./fixtures/listing";

const filters = { category: "", city: "", q: "", sort: "newest" as const };

describe("discovery URL state", () => {
  it("round trips shareable filters including special characters", () => {
    const value = { category: "Electronics", city: "New Delhi", q: "phone & case", sort: "price-desc" as const };
    expect(parseDiscoveryFilters(new URLSearchParams(discoveryQuery(value)))).toEqual(value);
  });
  it("clears defaults and normalizes unknown sorting", () => {
    expect(discoveryQuery(filters)).toBe("");
    expect(parseDiscoveryFilters(new URLSearchParams("sort=invalid&city=%20Mumbai%20"))).toEqual({ ...filters, city: "Mumbai" });
  });
});

describe("discovery search and sort", () => {
  it("searches case insensitively and preserves the input array", () => {
    const rows = [base, { ...base, id: "other", title: "Lamp", createdAt: base.createdAt + 100 }];
    expect(discoverListings(rows, { ...filters, q: "DESK" })).toEqual([base]);
    expect(discoverListings(rows, filters)[0].title).toBe("Lamp");
    expect(rows[0]).toBe(base);
  });
  it("sorts uint64 prices precisely without losing digits to number conversion", () => {
    const lower = { ...base, id: "lower", priceMinor: 18446744073709551614n };
    const upper = { ...base, id: "upper", priceMinor: 18446744073709551615n };
    expect(discoverListings([upper, lower], { ...filters, sort: "price-asc" })).toEqual([lower, upper]);
    expect(discoverListings([lower, upper], { ...filters, sort: "price-desc" })).toEqual([upper, lower]);
  });
  it("groups different currencies instead of comparing their numeric prices", () => {
    const usd = { ...base, currency: "USD", priceMinor: 1n };
    expect(discoverListings([usd, base], { ...filters, sort: "price-asc" })).toEqual([base, usd]);
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
