// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { FreshPayOrder } from "@/freshpay";
import { checkoutBlock } from "@/lib/freshpay/orders";
import { arkivPrompt } from "@/components/checkout/MerchantPayments";
import { parseOrderId } from "@/components/checkout/OrderReceipt";
import { fixtureListing as listing } from "./fixtures/listing";

const contract = "0x00000000000000000000000000000000000f5e5a" as const;
const buyer = "0x2222222222222222222222222222222222222222" as const;
const order: FreshPayOrder = {
  id: 4n, buyer, merchant: listing.seller, amount: listing.priceMinor, refunded: 0n, ref: listing.id as `0x${string}`,
  paidAt: 1, releaseAfter: 2, state: "Paid",
};

const mocks = vi.hoisted(() => ({
  listing: undefined as unknown, active: { data: null as unknown, isPending: false }, account: undefined as string | undefined,
  widget: vi.fn(),
}));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: mocks.account }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@rainbow-me/rainbowkit", () => ({ useConnectModal: () => ({ openConnectModal: vi.fn() }) }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({ ...await importOriginal<object>(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/hooks/useListings", () => ({
  useListing: () => ({ data: mocks.listing, isPending: false, isError: false }),
  useRabdiBlock: () => ({ data: 100n }),
}));
vi.mock("@/hooks/use-freshpay-orders", () => ({ useActiveOrder: () => mocks.active }));
vi.mock("@/hooks/use-seller-identity", () => ({ useSellerIdentity: () => ({ data: null, isError: false, isFetching: false }) }));
vi.mock("@/lib/freshpay/config", () => ({ freshPayConfig: { contract: "0x00000000000000000000000000000000000f5e5a" }, freshPayConfigurationError: null }));
vi.mock("@/freshpay", async (importOriginal) => ({
  ...await importOriginal<object>(),
  FreshPayCheckout: (props: unknown) => { mocks.widget(props); return <div>FreshPay widget</div>; },
}));

const { ListingCheckout } = await import("@/components/checkout/ListingCheckout");
afterEach(() => { cleanup(); vi.clearAllMocks(); Object.assign(mocks, { listing: undefined, active: { data: null, isPending: false }, account: undefined }); });

describe("Phase 10: checkout guard", () => {
  const base = { contract, listing, currentBlock: 100n };
  it("allows an available, priced, unexpired listing owned by its seller", () => {
    expect(checkoutBlock(base)).toBeNull();
    expect(checkoutBlock({ ...base, viewer: buyer })).toBeNull();
  });

  it("blocks every state where payment would be wrong", () => {
    expect(checkoutBlock({ ...base, contract: null })).toBe("not-deployed");
    expect(checkoutBlock({ ...base, listing: null })).toBe("missing");
    expect(checkoutBlock({ ...base, currentBlock: listing.expiresAtBlock })).toBe("expired");
    expect(checkoutBlock({ ...base, listing: { ...listing, status: "reserved" } })).toBe("not-available");
    expect(checkoutBlock({ ...base, listing: { ...listing, status: "sold" } })).toBe("not-available");
    expect(checkoutBlock({ ...base, listing: { ...listing, owner: buyer } })).toBe("foreign-owner");
    expect(checkoutBlock({ ...base, listing: { ...listing, priceMinor: 0n } })).toBe("free");
    expect(checkoutBlock({ ...base, viewer: listing.seller })).toBe("own-listing");
    expect(checkoutBlock({ ...base, activeOrder: order })).toBe("already-paid");
  });

  it("prompts sellers to update Arkiv themselves after payment", () => {
    expect(arkivPrompt(order, listing)).toMatch(/still shows as available/);
    expect(arkivPrompt({ ...order, state: "Released" }, { ...listing, status: "reserved" })).toMatch(/Mark the listing sold/);
    expect(arkivPrompt({ ...order, state: "Released" }, { ...listing, status: "sold" })).toBeNull();
    expect(arkivPrompt({ ...order, state: "Refunded" }, listing)).toBeNull();
    expect(arkivPrompt(order, null)).toBeNull();
  });

  it("accepts only u64 order numbers in receipt links", () => {
    expect(parseOrderId("7")).toBe(7n);
    expect(parseOrderId("18446744073709551615")).toBe(2n ** 64n - 1n);
    for (const bad of ["0", "-1", "07", "1.5", "abc", "18446744073709551616"]) expect(parseOrderId(bad)).toBeNull();
  });
});

describe("/checkout/[listingId]", () => {
  it("pays the Arkiv seller the Arkiv price for this listing key", () => {
    mocks.listing = listing;
    mocks.account = buyer;
    render(<ListingCheckout id={listing.id} />);
    expect(screen.getByText("FreshPay widget")).toBeTruthy();
    expect(mocks.widget.mock.calls[0][0]).toMatchObject({ contract, merchant: listing.seller, amount: listing.priceMinor, reference: listing.id });
  });

  it("refuses sold listings and already-paid items without rendering the widget", () => {
    mocks.listing = { ...listing, status: "sold" };
    const { rerender } = render(<ListingCheckout id={listing.id} />);
    expect(screen.getByRole("alert").textContent).toContain("reserved or sold");

    mocks.listing = listing;
    mocks.active = { data: order, isPending: false };
    rerender(<ListingCheckout id={listing.id} />);
    expect(screen.getByRole("alert").textContent).toContain("already paid");
    expect(screen.getByRole("link", { name: "View order #4" }).getAttribute("href")).toBe("/receipt/4");
    expect(mocks.widget).not.toHaveBeenCalled();
  });

  it("rejects malformed checkout links before reading Arkiv", () => {
    render(<ListingCheckout id="not-a-key" />);
    expect(screen.getByRole("heading", { name: "Invalid checkout link" })).toBeTruthy();
  });
});
