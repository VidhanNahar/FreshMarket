// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { freshPayAbi } from "@/freshpay/abi";
import { FreshPayCheckout } from "@/freshpay";

const contract = "0x00000000000000000000000000000000000f5e5a" as const;
const merchant = "0x1111111111111111111111111111111111111111" as const;
const buyer = "0x2222222222222222222222222222222222222222" as const;
const reference = `0x${"ab".repeat(32)}` as Hex;
const payHash = `0x${"cd".repeat(32)}` as Hex;
const approveHash = `0x${"ef".repeat(32)}` as Hex;

const mocks = vi.hoisted(() => ({
  account: undefined as `0x${string}` | undefined,
  chainId: 7794095,
  balance: 50_000_000n,
  allowance: 0n,
  switchChainAsync: vi.fn(),
  writeContractAsync: vi.fn(),
  connect: vi.fn(),
  simulateContract: vi.fn(),
}));

const paidLog = {
  address: contract,
  topics: encodeEventTopics({ abi: freshPayAbi, eventName: "OrderPaid", args: { orderId: 7n, merchant, buyer } }),
  data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "uint64" }], [reference, 12_500_000n, 1n]),
};
const client = {
  getChainId: async () => 1874,
  readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "balanceOf") return mocks.balance;
    if (functionName === "allowance") return mocks.allowance;
    return { buyer, paidAt: 1n, state: 1, merchant, releaseAfter: 2n, amount: 12_500_000n, refunded: 0n, ref: reference };
  }),
  simulateContract: mocks.simulateContract,
  waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
  getTransactionReceipt: vi.fn(async () => ({ status: "success", blockNumber: 9n, logs: [paidLog] })),
};

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: mocks.account, chainId: mocks.chainId }),
  usePublicClient: () => client,
  useSwitchChain: () => ({ switchChainAsync: mocks.switchChainAsync }),
  useWriteContract: () => ({ writeContractAsync: mocks.writeContractAsync }),
  useReadContract: () => ({ data: mocks.account ? mocks.balance : undefined, refetch: vi.fn() }),
  useConnect: () => ({ connect: mocks.connect, connectors: [{ id: "injected" }], isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.assign(mocks, { account: undefined, chainId: 7794095, balance: 50_000_000n, allowance: 0n });
});

const props = { contract, merchant, amount: 12_500_000n, reference };

describe("Phase 10: FreshPay checkout widget", () => {
  it("explains a missing configuration instead of crashing", () => {
    render(<FreshPayCheckout {...props} contract={undefined as unknown as `0x${string}`} />);
    expect(screen.getByRole("alert").textContent).toContain("Checkout unavailable");
  });

  it("connects through wagmi when the host supplies no connect handler", async () => {
    render(<FreshPayCheckout {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Connect wallet to pay" }));
    expect(mocks.connect).toHaveBeenCalledWith({ connector: { id: "injected" } });
  });

  it("switches network, approves the exact amount, pays and verifies the order", async () => {
    mocks.account = buyer;
    mocks.writeContractAsync.mockResolvedValueOnce(approveHash).mockResolvedValueOnce(payHash);
    const onSuccess = vi.fn();
    render(<FreshPayCheckout {...props} onSuccess={onSuccess} />);
    expect(screen.getByText(/Wallet balance on Whitechain Sepolia: 50.00 USDT/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Switch to Whitechain and pay" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(mocks.switchChainAsync).toHaveBeenCalledWith({ chainId: 1874 });
    const [approve, pay] = mocks.writeContractAsync.mock.calls.map(([call]) => call);
    expect(approve).toMatchObject({ functionName: "approve", args: [contract, 12_500_000n], chainId: 1874 });
    expect(pay).toMatchObject({ address: contract, functionName: "pay", chainId: 1874 });
    expect(pay.args.slice(0, 3)).toEqual([merchant, reference, 12_500_000n]);
    expect(onSuccess.mock.calls[0][0]).toMatchObject({ txHash: payHash, order: { id: 7n, state: "Paid" } });
    expect(screen.getByRole("status").textContent).toContain("Order #7 is confirmed on Whitechain");
    expect(screen.getByRole("link", { name: /Payment transaction/ }).getAttribute("href")).toBe(`https://explorer.testnet.whitechain.io/tx/${payHash}`);
  });

  it("skips approval when allowance already covers the payment", async () => {
    Object.assign(mocks, { account: buyer, chainId: 1874, allowance: 12_500_000n });
    mocks.writeContractAsync.mockResolvedValueOnce(payHash);
    render(<FreshPayCheckout {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Pay 12.50 USDT" }));
    await screen.findByText(/Order #7/);
    expect(mocks.switchChainAsync).not.toHaveBeenCalled();
    expect(mocks.writeContractAsync).toHaveBeenCalledTimes(1);
  });

  it("stops before any wallet prompt when the balance is too low", async () => {
    Object.assign(mocks, { account: buyer, chainId: 1874, balance: 1_000_000n });
    const onError = vi.fn();
    render(<FreshPayCheckout {...props} onError={onError} />);
    await userEvent.click(screen.getByRole("button", { name: "Pay 12.50 USDT" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Not enough USDT in this wallet for this payment."));
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("surfaces a failed simulation, such as an already-sold item, without signing", async () => {
    Object.assign(mocks, { account: buyer, chainId: 1874, allowance: 12_500_000n });
    mocks.simulateContract.mockRejectedValueOnce(new Error("This item has already been paid for."));
    render(<FreshPayCheckout {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Pay 12.50 USDT" }));
    expect(await screen.findByText("This item has already been paid for.")).toBeTruthy();
    expect(mocks.writeContractAsync).not.toHaveBeenCalled();
  });
});
