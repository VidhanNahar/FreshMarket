// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StorefrontSettings } from "@/components/identity/StorefrontSettings";
import { listingKeys } from "@/lib/arkiv/queries";

const owner = "0x1111111111111111111111111111111111111111" as const;
const manager = "0x2222222222222222222222222222222222222222" as const;
const mocks = vi.hoisted(() => ({
  account: "0x1111111111111111111111111111111111111111" as `0x${string}`,
  readStorefront: vi.fn(), listDelegates: vi.fn(), checkTextEdit: vi.fn(),
  grantTextDelegate: vi.fn(), revokeTextDelegate: vi.fn(), setStorefrontText: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: mocks.account, isConnected: true, chainId: 11155111 }),
  useWalletClient: () => ({ data: { account: { address: mocks.account }, chain: { id: 11155111 } } }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
}));
vi.mock("@rainbow-me/rainbowkit", () => ({ useConnectModal: () => ({ openConnectModal: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-seller-identity", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/hooks/use-seller-identity")>(),
  useSellerIdentity: () => ({ data: null, isFetching: false, isError: false }),
}));
vi.mock("@/lib/ens/client", () => ({ createEnsWalletClient: async () => ({}), ensPublicClient: {} }));
vi.mock("@/services/ens-delegation", () => ({ getEnsDelegationService: () => mocks }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.account = owner; });

const records = {
  name: "alice.market.eth", registry: "0x3333333333333333333333333333333333333333", resolver: "0x4444444444444444444444444444444444444444",
  owner, expiry: 2_000_000_000n, forwardAddress: owner, verified: true, ownerCanDelegate: true, readAtBlock: 123n,
  text: { "freshmarket.description": "Vintage cameras", "freshmarket.contact": "", description: "", url: "https://alice.example", avatar: "" },
};

async function load() {
  const user = userEvent.setup();
  const cache = new QueryClient(); cache.setQueryData(listingKeys.search(), []);
  mocks.readStorefront.mockResolvedValue(records);
  mocks.listDelegates.mockResolvedValue([{ account: manager, key: "freshmarket.contact" }]);
  render(<QueryClientProvider client={cache}><StorefrontSettings /></QueryClientProvider>);
  await user.type(screen.getByLabelText("Storefront ENS name"), "alice.market.eth");
  await user.click(screen.getByRole("button", { name: "Load storefront" }));
  await screen.findByRole("heading", { name: "alice.market.eth" });
  return { user, cache };
}

describe("/storefront/settings", () => {
  it("shows identity, records and delegates, and lets the owner revoke without touching Arkiv caches", async () => {
    mocks.revokeTextDelegate.mockResolvedValue({ txHash: `0x${"ab".repeat(32)}`, blockNumber: 9n });
    const { user, cache } = await load();
    expect(screen.getByText("Vintage cameras")).toBeTruthy();
    expect(screen.getByText("You own this storefront")).toBeTruthy();
    expect(await screen.findByText("freshmarket.contact", { selector: "li span span" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: `Revoke freshmarket.contact from ${manager}` }));
    await waitFor(() => expect(mocks.revokeTextDelegate).toHaveBeenCalledWith(expect.anything(), "alice.market.eth", "freshmarket.contact", manager));
    expect(await screen.findByRole("link", { name: /View on Sepolia Etherscan/ })).toBeTruthy();
    expect(cache.getQueryState(listingKeys.search())?.isInvalidated).toBe(false);
    cache.clear();
  });

  it("grants a key to a valid delegate address only", async () => {
    mocks.grantTextDelegate.mockResolvedValue({ txHash: `0x${"ab".repeat(32)}`, blockNumber: 9n });
    const { user, cache } = await load();
    const grant = screen.getByRole("button", { name: "Grant" }) as HTMLButtonElement;
    await user.type(screen.getByLabelText("Delegate wallet"), "0x123");
    expect(grant.disabled).toBe(true);
    await user.clear(screen.getByLabelText("Delegate wallet"));
    await user.type(screen.getByLabelText("Delegate wallet"), manager);
    await user.selectOptions(screen.getByLabelText("Record key"), "url");
    await user.click(grant);
    await waitFor(() => expect(mocks.grantTextDelegate).toHaveBeenCalledWith(expect.anything(), "alice.market.eth", "url", manager));
    cache.clear();
  });

  it("hides owner controls from a delegate and shows the resolver's unauthorized verdict", async () => {
    mocks.account = manager;
    mocks.checkTextEdit.mockResolvedValue({ allowed: false, reason: "Resolver rejected the edit (EACUnauthorizedAccountRoles)" });
    const { user, cache } = await load();
    expect(screen.queryByRole("button", { name: "Grant" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Revoke/ })).toBeNull();
    expect(await screen.findByText(/You are a delegate for/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Key"), "url");
    await user.click(screen.getByRole("button", { name: "Check permission" }));
    expect(await screen.findByText(/Unauthorized: Resolver rejected the edit/)).toBeTruthy();
    expect(mocks.checkTextEdit).toHaveBeenCalledWith("alice.market.eth", "url", manager);
    cache.clear();
  });
});
