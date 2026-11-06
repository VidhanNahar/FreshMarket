// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SellerIdentity } from "@/components/identity/SellerIdentity";
import { resolveSellerIdentity } from "@/services/ens-identity";
import type { SellerIdentity as IdentityData } from "@/services/ens-identity";
import { listingKeys } from "@/lib/arkiv/queries";

vi.mock("@/services/ens-identity", () => ({ resolveSellerIdentity: vi.fn() }));
const seller = "0x1111111111111111111111111111111111111111";
const identity: IdentityData = { address: seller, name: "alice.market.eth", avatar: null, description: "Used books", url: "https://example.com", verifiedAtBlock: 100n };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(profile = false) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cache.setQueryData(listingKeys.search(), []);
  const view = render(<QueryClientProvider client={cache}><h1>Listing available</h1><SellerIdentity address={seller} profile={profile} /></QueryClientProvider>);
  return { ...view, cache };
}

describe("Non-blocking ENS seller identity", () => {
  it("shows an address immediately while ENS is delayed and does not gate listing content", async () => {
    let complete!: (value: typeof identity) => void;
    vi.mocked(resolveSellerIdentity).mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const { cache } = mount();
    expect(screen.getByText("0x1111...1111")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Listing available" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: /verified/i })).toBeNull();
    complete(identity);
    expect(await screen.findByText("alice.market.eth")).toBeTruthy();
    expect(screen.getByRole("img", { name: /owner and forward address verified/i })).toBeTruthy();
    expect(cache.getQueryState(listingKeys.search())?.isInvalidated).toBe(false);
    cache.clear();
  });

  it("falls back without a badge when ENS fails", async () => {
    vi.mocked(resolveSellerIdentity).mockRejectedValue(new Error("ENS offline"));
    const { cache } = mount();
    await waitFor(() => expect(vi.mocked(resolveSellerIdentity)).toHaveBeenCalledTimes(1));
    expect(screen.getByText("0x1111...1111")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /verified/i })).toBeNull();
    cache.clear();
  });

  it("shows verified profile metadata while keeping the full original address", async () => {
    vi.mocked(resolveSellerIdentity).mockResolvedValue(identity);
    const { cache } = mount(true);
    expect(await screen.findByText("Used books")).toBeTruthy();
    expect(screen.getByText(seller)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Storefront website" }).getAttribute("href")).toBe("https://example.com");
    cache.clear();
  });
});
