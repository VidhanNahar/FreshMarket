// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListingFilters } from "@/components/listings/ListingFilters";
import { ListingCard } from "@/components/listings/ListingCard";
import { Marketplace } from "@/components/listings/Marketplace";
import { ListingDetail } from "@/components/listings/ListingDetail";
import { fixtureListing as listing } from "./fixtures/listing";

const { noCorrection, mocks } = vi.hoisted(() => {
  const noCorrection = { categoryPaths: [], textWords: [], recognized: [], corrected: false };
  return { noCorrection, mocks: {
  params: "", push: vi.fn(), refetch: vi.fn(), success: vi.fn(), error: vi.fn(),
  listings: { data: [] as unknown[], isPending: false, isError: false, isFetching: false, currentBlock: 100n, resolved: noCorrection, fallbackCategory: undefined as string | undefined },
  detail: { data: null as unknown, isPending: false, isError: false },
} };
});
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.params), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/hooks/useListings", () => ({
  useListings: () => ({ ...mocks.listings, refetch: mocks.refetch }),
  useListing: () => ({ ...mocks.detail, refetch: mocks.refetch }),
  useRabdiBlock: () => ({ data: 100n }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = "";
  mocks.listings = { data: [], isPending: false, isError: false, isFetching: false, currentBlock: 100n, resolved: noCorrection, fallbackCategory: undefined };
  mocks.detail = { data: listing, isPending: false, isError: false };
});

describe("URL discovery controls", () => {
  it("restores shared filters, applies category/sort, and clears everything", async () => {
    const user = userEvent.setup();
    mocks.params = "category=pets%2Fdogs&city=Mumbai&q=desk&sort=price-asc";
    render(<ListingFilters />);
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("desk");
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Mumbai");
    expect(screen.getByRole("button", { name: "Pets" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Subcategory") as HTMLSelectElement).value).toBe("pets/dogs");
    await user.selectOptions(screen.getByLabelText("Subcategory"), "pets/dogs/toys");
    expect(mocks.push).toHaveBeenLastCalledWith("/browse?q=desk&category=pets%2Fdogs%2Ftoys&city=Mumbai&sort=price-asc", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Electronics" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/browse?q=desk&category=electronics&city=Mumbai&sort=price-asc", { scroll: false });
    await user.selectOptions(screen.getByLabelText("Condition"), "like-new");
    expect(mocks.push).toHaveBeenLastCalledWith("/browse?q=desk&category=pets%2Fdogs&city=Mumbai&condition=like-new&sort=price-asc", { scroll: false });
    await user.selectOptions(screen.getByLabelText("Sort by"), "price-desc");
    expect(mocks.push).toHaveBeenLastCalledWith("/browse?q=desk&category=pets%2Fdogs&city=Mumbai&sort=price-desc", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/browse", { scroll: false });
  });
  it("submits trimmed search, city and USDT price range with URL-safe encoding", async () => {
    const user = userEvent.setup();
    render(<ListingFilters />);
    await user.type(screen.getByLabelText("Search"), "phone & case");
    await user.type(screen.getByLabelText("City"), " New Delhi ");
    await user.type(screen.getByLabelText("Min USDT"), "5");
    await user.type(screen.getByLabelText("Max USDT"), "20");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(mocks.push).toHaveBeenCalledWith("/browse?q=phone+%26+case&city=New+Delhi&minPrice=5&maxPrice=20", { scroll: false });
  });
});

describe("public marketplace states", () => {
  it("keeps cached results visible when a background refresh fails", () => {
    Object.assign(mocks.listings, { data: [listing], isError: true, hasData: true });
    render(<Marketplace />);
    expect(screen.getByRole("link", { name: /Wooden desk/ })).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("last successful results");
    expect(screen.getByRole("button", { name: "Retry refresh" })).toBeDefined();
  });

  it("renders loading, retryable failure, empty, and populated grids without a wallet", async () => {
    mocks.listings.isPending = true;
    const { rerender } = render(<Marketplace />);
    expect(screen.getByRole("status", { name: "Loading listings" })).toBeDefined();
    mocks.listings.isPending = false;
    mocks.listings.isError = true;
    rerender(<Marketplace />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    mocks.listings.isError = false;
    rerender(<Marketplace />);
    expect(screen.getByText("No listings found")).toBeDefined();
    mocks.listings.data = [listing];
    rerender(<Marketplace />);
    expect(screen.getByRole("link", { name: /Wooden desk/ }).getAttribute("href")).toBe(`/listing/${listing.id}`);
  });
  it.each(["available", "reserved", "sold"] as const)("displays %s status and a fallback when an image fails", (status) => {
    render(<ListingCard listing={{ ...listing, status }} currentBlock={100n} />);
    expect(screen.getByText(status)).toBeDefined();
    fireEvent.error(screen.getByRole("img", { name: listing.title }));
    expect(screen.getByText("Image unavailable")).toBeDefined();
  });
});

describe("listing details", () => {
  it("shows the actual item, description, seller, record link, and share fallback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ListingDetail id={listing.id} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(listing.title);
    expect(screen.getByText(listing.description)).toBeDefined();
    expect(screen.getByText(listing.seller)).toBeDefined();
    expect(screen.getByRole("link", { name: /Rabdi Explorer/ }).getAttribute("href")).toContain(listing.id);
    await user.click(screen.getByRole("button", { name: "Share listing" }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(mocks.success).toHaveBeenCalledWith("Listing link copied");
  });
  it("handles invalid, missing, expired, loading and failed reads", async () => {
    const { rerender } = render(<ListingDetail id="invalid" />);
    expect(screen.getByText("Invalid listing link")).toBeDefined();
    mocks.detail.isPending = true;
    rerender(<ListingDetail id={listing.id} />);
    expect(screen.getByRole("status", { name: "Loading listing" })).toBeDefined();
    mocks.detail.isPending = false;
    mocks.detail.isError = true;
    rerender(<ListingDetail id={listing.id} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    mocks.detail.isError = false;
    mocks.detail.data = null;
    rerender(<ListingDetail id={listing.id} />);
    expect(screen.getByText("Listing no longer available")).toBeDefined();
    mocks.detail.data = { ...listing, expiresAtBlock: 99n };
    rerender(<ListingDetail id={listing.id} />);
    expect(screen.getByText("Listing no longer available")).toBeDefined();
  });
});
