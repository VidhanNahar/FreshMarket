// @vitest-environment jsdom
/**
 * Phase 11 (#39): Arkiv (Rabdi), ENSv2 (Ethereum Sepolia) and FreshPay (Whitechain Sepolia) stay
 * independent. A failure or network switch on one chain must never hide or corrupt another's data.
 * The real-chain halves live in the opt-in live tests: listing-*-live (Arkiv), ens-*-live (ENS) and
 * freshpay-fork-live (USDT settlement on a Whitechain fork).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ListingDetail } from "@/components/listings/ListingDetail";
import { RabdiNetworkGuard } from "@/components/wallet/RabdiNetworkGuard";
import { NetworkStatusBadge } from "@/components/wallet/NetworkStatusBadge";
import { checkoutBlock } from "@/lib/freshpay/orders";
import { PAGE_NETWORKS, pageNetwork } from "@/lib/wallet/page-networks";
import { fixtureListing as listing } from "./fixtures/listing";

const mocks = vi.hoisted(() => ({
  pathname: "/browse",
  chainId: 7794095,
  connected: true,
  identity: { data: null as unknown, isError: false, isFetching: false },
  reviews: { data: [] as unknown[], isPending: false, isError: false },
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: mocks.connected ? "0x2222222222222222222222222222222222222222" : undefined, isConnected: mocks.connected, chain: { id: mocks.chainId } }),
  useChainId: () => mocks.chainId,
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
  useBalance: () => ({ data: undefined }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useListings", () => ({
  useListing: () => ({ data: listing, isPending: false, isError: false, isFetching: false, refetch: vi.fn() }),
  useRabdiBlock: () => ({ data: 100n }),
}));
vi.mock("@/hooks/use-seller-identity", () => ({ useSellerIdentity: () => mocks.identity }));
vi.mock("@/hooks/use-reviews", () => ({ useSellerReviews: () => mocks.reviews }));

beforeEach(() => {
  Object.assign(mocks, { pathname: "/browse", chainId: 7794095, connected: true });
  mocks.identity = { data: null, isError: false, isFetching: false };
  mocks.reviews = { data: [], isPending: false, isError: false };
});
afterEach(cleanup);

function expectListingIntact() {
  expect(screen.getByRole("heading", { name: listing.title })).toBeTruthy();
  expect(screen.getByText("49.99 USDT")).toBeTruthy();
  expect(screen.getByText(listing.seller)).toBeTruthy(); // Raw address is always available
  expect(screen.getByRole("link", { name: /Buy now with USDT/ }).getAttribute("href")).toBe(`/checkout/${listing.id}`);
}

describe("Phase 11: graceful degradation across networks", () => {
  it("shows the Arkiv listing with the raw seller address when ENS resolution fails", () => {
    mocks.identity = { data: null, isError: true, isFetching: false };
    render(<ListingDetail id={listing.id} />);
    expectListingIntact();
    expect(screen.queryByRole("img", { name: /ENS name/ })).toBeNull();
  });

  it("shows the ENS name when Sepolia resolves it, beside the Arkiv data", () => {
    mocks.identity = { data: { name: "alice.freshmarket.eth" }, isError: false, isFetching: false };
    render(<ListingDetail id={listing.id} />);
    expectListingIntact();
    expect(screen.getAllByText("alice.freshmarket.eth").length).toBeGreaterThan(0);
  });

  it("keeps the listing and Buy button when Whitechain-backed review checks fail", () => {
    mocks.reviews = { data: [], isPending: false, isError: true };
    render(<ListingDetail id={listing.id} />);
    expectListingIntact();
    expect(screen.getByRole("alert").textContent).toContain("Reviews could not be loaded");
  });

  it("does not change listing content when the wallet switches Rabdi → Sepolia → Whitechain", () => {
    const { rerender } = render(<ListingDetail id={listing.id} />);
    for (const chainId of [11155111, 1874, 7794095]) {
      mocks.chainId = chainId;
      rerender(<ListingDetail id={listing.id} />);
      expectListingIntact();
    }
  });

  it("lets a missing FreshPay deployment block checkout without affecting the listing", () => {
    expect(checkoutBlock({ contract: null, listing })).toBe("not-deployed");
    render(<ListingDetail id={listing.id} />);
    expectListingIntact();
  });
});

describe("Phase 11: each page asks for the chain it needs", () => {
  it("maps marketplace, ENS and payment pages to Rabdi, Sepolia and Whitechain", () => {
    expect(PAGE_NETWORKS[pageNetwork("/sell")].chainId).toBe(7794095);
    expect(PAGE_NETWORKS[pageNetwork("/storefront/settings")].chainId).toBe(11155111);
    expect(PAGE_NETWORKS[pageNetwork("/receipt/3")].chainId).toBe(1874);
  });

  it("warns about the wrong network only on pages that write to Arkiv", () => {
    Object.assign(mocks, { chainId: 1874, pathname: "/sell" });
    const { container, rerender } = render(<RabdiNetworkGuard />);
    expect(screen.getByRole("alert").textContent).toContain("Wrong network: Whitechain Sepolia");
    for (const pathname of ["/browse", "/checkout/0xabc", "/merchant/payments", "/identity"]) {
      mocks.pathname = pathname;
      rerender(<RabdiNetworkGuard />);
      expect(container.textContent).toBe("");
    }
  });

  it("names the network each page needs in the navbar badge", () => {
    const cases: [string, number, string][] = [
      ["/browse", 7794095, "Arkiv Rabdi Testnet · 7794095"],
      ["/browse", 1874, "Switch to Arkiv Rabdi Testnet"],
      ["/merchant/payments", 7794095, "Switch to Whitechain Sepolia"],
      ["/merchant/payments", 1874, "Whitechain Sepolia · 1874"],
      ["/identity", 11155111, "Ethereum Sepolia · 11155111"],
    ];
    for (const [pathname, chainId, text] of cases) {
      Object.assign(mocks, { pathname, chainId });
      const { unmount } = render(<NetworkStatusBadge />);
      expect(document.body.textContent).toContain(text);
      unmount();
    }
  });
});
