// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePublishListing } from "@/hooks/use-publish-listing";
import { fixtureListing as listing } from "./fixtures/listing";
import { expiryDemoPreset } from "@/domain/expiry-demo";
const mocks = vi.hoisted(() => ({ publish: vi.fn(), submitted: undefined as undefined | ((hash: `0x${string}`) => void) }));
vi.mock("wagmi", () => ({ useWalletClient: () => ({ data: {} }) }));
vi.mock("@/lib/arkiv/wallet", () => ({ createListingWalletClient: async (_wallet: unknown, events: { onSubmitted?: typeof mocks.submitted }) => { mocks.submitted = events.onSubmitted; return {}; } }));
vi.mock("@/services/publish-listing", () => ({ publishListing: mocks.publish, verifyPublishedListing: vi.fn() }));
vi.mock("@/lib/arkiv/expiration", () => ({ estimateListingExpiration: async () => null }));
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  return renderHook(() => usePublishListing(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider> });
}
describe("publication reset safety", () => {
  it("does not let reset discard an unconfirmed submitted hash or enable duplicate creation", async () => {
    mocks.publish.mockImplementation(async () => { mocks.submitted?.(listing.id as `0x${string}`); throw new Error("offline after submission"); });
    const { result } = setup();
    const input = { ...expiryDemoPreset, media: [expiryDemoPreset.imageUrl], seller: listing.seller };
    await act(async () => { await expect(result.current.submit(input)).rejects.toThrow(); });
    expect(result.current.txHash).toBe(listing.id);
    act(() => result.current.reset());
    expect(result.current.txHash).toBe(listing.id);
    expect(result.current.canSubmit).toBe(false);
    await act(async () => { await expect(result.current.submit(input)).rejects.toThrow("submission already exists"); });
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
  it("allows deliberate reset after a confirmed receipt", async () => {
    const receipt = { entityKey: listing.id, txHash: listing.id, expiresAt: listing.expiresAtBlock };
    mocks.publish.mockImplementation(async (_input, _wallet, confirmed) => { confirmed(receipt); return { receipt, listing }; });
    const { result } = setup();
    await act(async () => { await result.current.submit({ ...expiryDemoPreset, media: [expiryDemoPreset.imageUrl], seller: listing.seller }); });
    expect(result.current.phase).toBe("verified");
    act(() => result.current.reset());
    expect(result.current.phase).toBe("idle");
    expect(result.current.txHash).toBeUndefined();
  });
});
