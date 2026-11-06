// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StorefrontIdentityManager } from "@/components/identity/StorefrontIdentityManager";
import type { EnsWriteEvents } from "@/lib/ens/client";
import { listingKeys } from "@/lib/arkiv/queries";

const mocks = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111" as const,
  register: vi.fn(), check: vi.fn(), events: {} as EnsWriteEvents,
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: mocks.address, isConnected: true, chainId: 11155111 }),
  useWalletClient: () => ({ data: { account: { address: mocks.address }, chain: { id: 11155111 } } }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
}));
vi.mock("@rainbow-me/rainbowkit", () => ({ useConnectModal: () => ({ openConnectModal: vi.fn() }) }));
vi.mock("@/hooks/use-seller-identity", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/hooks/use-seller-identity")>(),
  useSellerIdentity: () => ({ data: null, isFetching: false, isError: false }),
}));
vi.mock("@/lib/ens/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ens/config")>();
  return { ...actual, ensConfig: { ...actual.ensConfig, parentName: "market.eth" } };
});
vi.mock("@/lib/ens/client", () => ({
  createEnsWalletClient: async (_wallet: unknown, events: EnsWriteEvents) => { mocks.events = events; return {}; },
  ensPublicClient: { getTransactionReceipt: (...args: unknown[]) => mocks.check(...args) },
}));
vi.mock("@/services/ens-storefront", () => ({ ensStorefrontService: { register: (...args: unknown[]) => mocks.register(...args) } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.events = {}; });

async function setup() {
  const user = userEvent.setup();
  const cache = new QueryClient(); cache.setQueryData(listingKeys.search(), []);
  render(<QueryClientProvider client={cache}><StorefrontIdentityManager /></QueryClientProvider>);
  await user.type(screen.getByLabelText("Storefront handle"), "alice");
  await user.type(screen.getByLabelText("Seller PermissionedResolver address"), "0x4444444444444444444444444444444444444444");
  return { user, cache, button: screen.getByRole("button", { name: "Register seller-owned subname" }) };
}

describe("ENS setup write safety", () => {
  it("prevents duplicate clicks and retains the submitted hash after a verification error", async () => {
    let reject!: (reason: Error) => void;
    mocks.register.mockImplementation(() => {
      mocks.events.onSubmitted?.(`0x${"ab".repeat(32)}`);
      return new Promise((_resolve, fail) => { reject = fail; });
    });
    const { user, cache, button } = await setup();
    await user.dblClick(button);
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => reject(new Error("Public verification delayed")));
    expect(await screen.findByRole("button", { name: "Check submitted transaction" })).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: /View Sepolia transaction/ }).getAttribute("href")).toContain("0xabab");
    expect(cache.getQueryState(listingKeys.search())?.isInvalidated).toBe(false);
    cache.clear();
  });

  it("checks a pending receipt without submitting another transaction", async () => {
    mocks.register.mockImplementation(async () => {
      mocks.events.onSubmitted?.(`0x${"ab".repeat(32)}`);
      throw new Error("Receipt unavailable");
    });
    mocks.check.mockResolvedValue({ status: "success" });
    const { user, cache, button } = await setup();
    await user.click(button);
    await user.click(await screen.findByRole("button", { name: "Check submitted transaction" }));
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(cache.getQueryState(listingKeys.search())?.isInvalidated).toBe(false);
    cache.clear();
  });
});
