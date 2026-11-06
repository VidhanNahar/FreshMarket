// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useListing, useListings } from "@/hooks/useListings";
import { fixtureListing as listing } from "./fixtures/listing";
import { invalidateListings, listingKeys } from "@/lib/arkiv/queries";

const mocks = vi.hoisted(() => ({ searchAll: vi.fn(), getById: vi.fn(), getBlockNumber: vi.fn() }));
vi.mock("@/services/listing-repository", () => ({ listingRepository: mocks }));
vi.mock("@/lib/arkiv/chain", () => ({ ARKIV_RABDI_CHAIN_ID: 7794095, getArkivPublicClient: () => mocks }));
const filters = { q: "", category: "furniture", city: "Mumbai", condition: "" as const, fulfilment: "" as const, minPrice: "", maxPrice: "", sort: "newest" as const };
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
  it("automatically prunes an available item when a later confirmed block reaches expiry", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useListings(filters), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual([listing]));
    await act(async () => { client.setQueryData(["rabdi", "blockNumber"], listing.expiresAtBlock); });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(listing.status).toBe("available");
    client.clear();
  });

  it("refreshes the catalogue on publishing invalidation and shares verified detail data", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const catalog = renderHook(() => useListings(filters), { wrapper: wrap });
    await waitFor(() => expect(catalog.result.current.isSuccess).toBe(true));
    mocks.searchAll.mockResolvedValueOnce([{ ...listing, title: "Updated desk" }]);
    await act(() => invalidateListings(client));
    await waitFor(() => expect(catalog.result.current.data[0].title).toBe("Updated desk"));
    expect(mocks.searchAll).toHaveBeenCalledTimes(2);
    client.setQueryData(listingKeys.detail(listing.id), listing);
    const detail = renderHook(() => useListing(listing.id), { wrapper: wrap });
    expect(detail.result.current.data).toEqual(listing);
    expect(mocks.getById).not.toHaveBeenCalled();
  });
  it("queries indexed category/city without a wallet, then text-matches the cached candidates", async () => {
    mocks.searchAll.mockResolvedValue([listing, { ...listing, id: "expired", expiresAtBlock: 99n }]);
    const { result, rerender } = renderHook((q: string) => useListings({ ...filters, q }), { initialProps: "desk", wrapper: wrapper() });
    await waitFor(() => expect(result.current.currentBlock).toBe(100n));
    await waitFor(() => expect(result.current.data).toEqual([listing]));
    expect(mocks.searchAll).toHaveBeenCalledWith({ categoryPaths: ["furniture/tables"], city: "Mumbai" });
    rerender("missing");
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
  it("loads a detail record but never sends malformed IDs to the RPC", async () => {
    const { result, rerender } = renderHook((id: string) => useListing(id), { initialProps: "invalid", wrapper: wrapper() });
    expect(mocks.getById).not.toHaveBeenCalled();
    rerender(listing.id);
    await waitFor(() => expect(result.current.data).toEqual(listing));
    expect(mocks.getById).toHaveBeenCalledWith(listing.id);
  });
});
