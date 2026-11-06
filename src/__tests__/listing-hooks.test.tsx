// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useListing, useListings } from "@/hooks/useListings";
import { fixtureListing as listing } from "./fixtures/listing";

const mocks = vi.hoisted(() => ({ searchAll: vi.fn(), getById: vi.fn(), getBlockNumber: vi.fn() }));
vi.mock("@/services/listing-repository", () => ({ listingRepository: mocks }));
vi.mock("@/lib/arkiv/chain", () => ({ getArkivPublicClient: () => mocks }));
const filters = { category: "Furniture", city: "Mumbai", q: "", sort: "newest" as const };
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchAll.mockResolvedValue([listing]);
  mocks.getById.mockResolvedValue(listing);
  mocks.getBlockNumber.mockResolvedValue(100n);
});

describe("public listing hooks", () => {
  it("queries category/city without a wallet, then searches and sorts the cached catalogue", async () => {
    mocks.searchAll.mockResolvedValue([listing, { ...listing, id: "expired", expiresAtBlock: 99n }]);
    const { result, rerender } = renderHook((q: string) => useListings({ ...filters, q }), { initialProps: "desk", wrapper: wrapper() });
    await waitFor(() => expect(result.current.currentBlock).toBe(100n));
    await waitFor(() => expect(result.current.data).toEqual([listing]));
    expect(mocks.searchAll).toHaveBeenCalledWith({ category: "Furniture", city: "Mumbai" });
    rerender("missing");
    expect(result.current.data).toEqual([]);
    expect(mocks.searchAll).toHaveBeenCalledOnce();
  });
  it("loads a detail record but never sends malformed IDs to the RPC", async () => {
    const { result, rerender } = renderHook((id: string) => useListing(id), { initialProps: "invalid", wrapper: wrapper() });
    expect(mocks.getById).not.toHaveBeenCalled();
    rerender(listing.id);
    await waitFor(() => expect(result.current.data).toEqual(listing));
    expect(mocks.getById).toHaveBeenCalledWith(listing.id);
  });
});
