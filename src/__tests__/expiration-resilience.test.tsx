// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ExpirationCountdown } from "@/components/listings/ExpirationCountdown";
import { ErrorBoundary } from "@/components/resilience/ErrorBoundary";
import { expirationState, isListingExpired } from "@/lib/listing-expiration";
import { matchesDiscoveryFilters } from "@/lib/listing-discovery";
import { formatPrice, isListingStatus, toPriceMinor } from "@/domain/listing";
import { expiryDemoPreset } from "@/domain/expiry-demo";
import { listingFormSchema } from "@/domain/listing-schema";
import { ExpirationTime } from "@arkiv-network/sdk";
import { fixtureListing as listing } from "./fixtures/listing";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("expiration and resilient domain behavior", () => {
  it("counts down, warns below 24 hours, and waits for confirmed expiry", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = render(<ExpirationCountdown expiresAtBlock={110n} currentBlock={100n} />);
    expect(screen.getByText("Expires in ~20 seconds").className).toContain("amber");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText("Expires in ~15 seconds")).toBeDefined();
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByText("Awaiting expiration confirmation")).toBeDefined();
    rerender(<ExpirationCountdown expiresAtBlock={110n} currentBlock={110n} />);
    expect(screen.getByText("Expired")).toBeDefined();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("separates sold status from expired block state", () => {
    const sold = { ...listing, status: "sold" as const };
    expect(isListingStatus(sold.status)).toBe(true);
    expect(isListingStatus("expired")).toBe(false);
    expect(isListingExpired(sold, sold.expiresAtBlock - 1n)).toBe(false);
    expect(isListingExpired(listing, listing.expiresAtBlock)).toBe(true);
    expect(expirationState(100n).label).toBe("Expires at block 100");
    expect(expirationState(43300n, 100n).nearExpiry).toBe(false);
  });
  it("matches exact category/city plus case-insensitive title search", () => {
    const filters = { category: "Furniture", city: "Mumbai", q: "DESK", sort: "newest" as const };
    expect(matchesDiscoveryFilters(listing, filters)).toBe(true);
    expect(matchesDiscoveryFilters(listing, { ...filters, city: "Delhi" })).toBe(false);
    expect(matchesDiscoveryFilters(listing, { ...filters, category: "Books" })).toBe(false);
  });
  it("roundtrips INR/USD prices without changing their minor units", () => {
    expect(toPriceMinor(1.005)).toBe(101n);
    expect(formatPrice(12550n, "INR")).toBe("₹125.50");
    expect(formatPrice(12550n, "USD")).toBe("$125.50");
  });
  it("validates the demo fixture and builds exactly 450 lifetime blocks", () => {
    expect(listingFormSchema.safeParse(expiryDemoPreset).success).toBe(true);
    expect(ExpirationTime.fromDays(expiryDemoPreset.expirationDays).minLifetime).toBe(450n);
  });
  it("contains unexpected rendering failures and offers reload without exposing internals", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never { throw new Error("sensitive RPC URL"); }
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeDefined();
    expect(screen.queryByText("sensitive RPC URL")).toBeNull();
  });
});
