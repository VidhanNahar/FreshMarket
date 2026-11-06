// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useListingActions } from "@/hooks/use-listing-actions";
import { listingKeys } from "@/lib/arkiv/queries";
import { fixtureListing as listing } from "./fixtures/listing";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), verify: vi.fn(), receipt: vi.fn(),
  events: undefined as undefined | { onSubmitted?: (hash: `0x${string}`) => void },
  account: "0x1111111111111111111111111111111111111111",
}));
vi.mock("wagmi", () => ({ useWalletClient: () => ({ data: {} }) }));
vi.mock("@/lib/arkiv/wallet", () => ({ createListingWalletClient: async (_wallet: unknown, events: typeof mocks.events) => { mocks.events = events; return { account: { address: mocks.account } }; } }));
vi.mock("@/services/listing-lifecycle", async (importOriginal) => ({ ...await importOriginal<typeof import("@/services/listing-lifecycle")>(), executeListingAction: mocks.execute, verifyListingAction: mocks.verify }));
vi.mock("@/lib/arkiv/chain", () => ({ ARKIV_RABDI_CHAIN_ID: 7794095, getArkivPublicClient: () => ({ getTransactionReceipt: mocks.receipt }) }));
vi.mock("sonner", () => ({ toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn() } }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.events = undefined;
  mocks.account = listing.seller;
  mocks.execute.mockResolvedValue({ entityKey: listing.id, txHash: listing.id });
  mocks.verify.mockResolvedValue({ ...listing, status: "reserved" });
  mocks.receipt.mockResolvedValue({ status: "success" });
});
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  cache.setQueryData(listingKeys.catalog(), [listing]);
  const hook = renderHook(() => useListingActions(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider> });
  return { ...hook, cache };
}

describe("seller action transaction state", () => {
  it("rolls back a rejected signature and sends only one wallet operation", async () => {
    mocks.execute.mockRejectedValue(Object.assign(new Error("User rejected"), { code: 4001 }));
    const { result, cache } = setup();
    await act(async () => { expect(await result.current.run(listing, { kind: "status", status: "reserved" })).toBe(false); });
    expect(cache.getQueryData(listingKeys.catalog())).toEqual([listing]);
    expect(result.current.phase).toBe("error");
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("blocks duplicate clicks while awaiting confirmation and invalidates every listing cache", async () => {
    let resolve!: (receipt: { entityKey: string; txHash: string }) => void;
    mocks.execute.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result, cache } = setup();
    let pending!: Promise<boolean>;
    await act(async () => { pending = result.current.run(listing, { kind: "status", status: "reserved" }); });
    expect(result.current.isPending).toBe(true);
    expect(cache.getQueryData(listingKeys.catalog())).toEqual([]);
    await act(async () => { expect(await result.current.run(listing, { kind: "delete" })).toBe(false); });
    await act(async () => { resolve({ entityKey: listing.id, txHash: listing.id }); await pending; });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe("confirmed");
    expect(cache.getQueryState(listingKeys.catalog())?.isInvalidated).toBe(true);
  });
  it("locks an unknown broadcast outcome until read-only confirmation succeeds", async () => {
    mocks.execute.mockImplementation(async () => { mocks.events?.onSubmitted?.(listing.id as `0x${string}`); throw new Error("RPC offline after broadcast"); });
    const { result } = setup();
    await act(async () => { await result.current.run(listing, { kind: "delete" }); });
    expect(result.current.phase).toBe("unknown");
    expect(result.current.txHash).toBe(listing.id);
    await act(async () => { expect(await result.current.run(listing, { kind: "delete" })).toBe(false); });
    expect(mocks.execute).toHaveBeenCalledOnce();
    await act(async () => { await result.current.checkTransaction(); });
    expect(result.current.phase).toBe("confirmed");
    expect(mocks.receipt).toHaveBeenCalledWith({ hash: listing.id });
  });
  it("restores deleted data when an unknown transaction later proves reverted", async () => {
    mocks.execute.mockImplementation(async () => { mocks.events?.onSubmitted?.(listing.id as `0x${string}`); throw new Error("timeout"); });
    mocks.receipt.mockResolvedValue({ status: "reverted" });
    const { result, cache } = setup();
    await act(async () => { await result.current.run(listing, { kind: "delete" }); });
    expect(cache.getQueryData(listingKeys.catalog())).toEqual([]);
    await act(async () => { await result.current.checkTransaction(); });
    expect(cache.getQueryData(listingKeys.catalog())).toEqual([listing]);
    expect(result.current.phase).toBe("error");
  });
  it("keeps confirmed changes while indexing lags and never retries the write", async () => {
    mocks.verify.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => { expect(await result.current.run(listing, { kind: "status", status: "sold" })).toBe(true); });
    expect(result.current.phase).toBe("delayed");
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it("blocks an account mismatch before applying optimism or executing a write", async () => {
    mocks.account = "0x2222222222222222222222222222222222222222";
    const { result, cache } = setup();
    await act(async () => { expect(await result.current.run(listing, { kind: "delete" })).toBe(false); });
    expect(cache.getQueryData(listingKeys.catalog())).toEqual([listing]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
