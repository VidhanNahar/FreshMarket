// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SellerDashboard } from "@/components/seller/SellerDashboard";
import { fixtureListing as listing } from "./fixtures/listing";

const mocks = vi.hoisted(() => ({
  account: { address: "0x1111111111111111111111111111111111111111", isConnected: true, chainId: 7794095 },
  data: [] as unknown[], pending: false, error: false, busy: false,
  connect: vi.fn(), run: vi.fn(), refetch: vi.fn(), switchChain: vi.fn(),
}));
vi.mock("@/hooks/use-seller-identity", () => ({ useSellerIdentity: () => ({ data: null, isError: false, isFetching: false }) }));
vi.mock("wagmi", () => ({ useAccount: () => mocks.account, useSwitchChain: () => ({ switchChainAsync: mocks.switchChain, isPending: false }) }));
vi.mock("@rainbow-me/rainbowkit", () => ({ useConnectModal: () => ({ openConnectModal: mocks.connect }) }));
vi.mock("@/hooks/use-seller-listings", () => ({ useSellerListings: () => ({ data: mocks.data, isPending: mocks.pending, isError: mocks.error, isFetching: false, refetch: mocks.refetch }) }));
vi.mock("@/hooks/useListings", () => ({ useRabdiBlock: () => ({ data: 100n }) }));
vi.mock("@/hooks/use-listing-actions", () => ({ useListingActions: () => ({ run: mocks.run, phase: "idle", isPending: mocks.busy }) }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.account = { address: listing.seller, isConnected: true, chainId: 7794095 };
  mocks.data = [listing, { ...listing, id: "reserved", title: "Reserved desk", status: "reserved" }, { ...listing, id: "sold", title: "Sold desk", status: "sold" }, { ...listing, id: "other", title: "Other seller", owner: "0x2222222222222222222222222222222222222222" }];
  mocks.pending = false; mocks.error = false; mocks.busy = false;
  mocks.run.mockResolvedValue(true);
});

describe("seller inventory", () => {
  it("offers renewal for a listing with less than 24 hours remaining", async () => {
    mocks.data = [{ ...listing, expiresAtBlock: 1000n }];
    render(<SellerDashboard />);
    await userEvent.click(screen.getByRole("button", { name: "Renew listing" }));
    expect(screen.getByLabelText("Additional days")).toBeDefined();
  });

  it("requires a wallet and never exposes another seller's items", async () => {
    const { rerender } = render(<SellerDashboard />);
    expect(screen.queryByText("Other seller")).toBeNull();
    mocks.account.isConnected = false;
    rerender(<SellerDashboard />);
    expect(screen.queryByRole("article")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(mocks.connect).toHaveBeenCalledOnce();
  });
  it("filters all statuses and submits explicit lifecycle transitions", async () => {
    const user = userEvent.setup();
    render(<SellerDashboard />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /reserved \(1\)/i }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Mark as sold" }));
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ id: "reserved" }), { kind: "status", status: "sold" });
  });
  it("confirms permanent deletion, supports cancellation, and sends no request just for opening a dialog", async () => {
    const user = userEvent.setup();
    render(<SellerDashboard />);
    const row = within(screen.getByRole("article", { name: listing.title }));
    await user.click(row.getByRole("button", { name: "Delete listing" }));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(mocks.run).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(row.getByRole("button", { name: "Delete listing" }));
    await user.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(mocks.run).toHaveBeenCalledWith(listing, { kind: "delete" });
  });
  it("submits exact price/description edits and selected additional days", async () => {
    const user = userEvent.setup();
    render(<SellerDashboard />);
    const row = within(screen.getByRole("article", { name: listing.title }));
    await user.click(row.getByRole("button", { name: "Edit price & description" }));
    const price = screen.getByLabelText("Price (USDT, up to 6 decimals)");
    await user.clear(price); await user.type(price, "125.50");
    const description = screen.getByLabelText("Description");
    await user.clear(description); await user.type(description, "Updated desk description");
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));
    expect(mocks.run).toHaveBeenCalledWith(listing, { kind: "edit", changes: { priceMinor: 125_500_000n, description: "Updated desk description" } });
    await user.click(row.getByRole("button", { name: "Extend expiration" }));
    await user.selectOptions(screen.getByLabelText("Additional days"), "30");
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));
    expect(mocks.run).toHaveBeenLastCalledWith(listing, { kind: "extend", days: 30 });
  });
  it("disables mutations on the wrong chain or while a transaction is pending", () => {
    mocks.account.chainId = 1;
    const { rerender } = render(<SellerDashboard />);
    expect(screen.getByRole("button", { name: "Switch to Rabdi" })).toBeDefined();
    expect((screen.getAllByRole("button", { name: "Delete listing" })[0] as HTMLButtonElement).disabled).toBe(true);
    mocks.account.chainId = 7794095;
    mocks.busy = true;
    rerender(<SellerDashboard />);
    expect((screen.getAllByRole("button", { name: "Delete listing" })[0] as HTMLButtonElement).disabled).toBe(true);
  });
  it("handles loading, RPC errors, and empty inventory", async () => {
    mocks.pending = true;
    const { rerender } = render(<SellerDashboard />);
    expect(screen.getByRole("status", { name: "Loading listings" })).toBeDefined();
    mocks.pending = false; mocks.error = true;
    rerender(<SellerDashboard />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    mocks.error = false; mocks.data = [];
    rerender(<SellerDashboard />);
    expect(screen.getByRole("link", { name: "Create your first listing" }).getAttribute("href")).toBe("/sell");
  });
});
