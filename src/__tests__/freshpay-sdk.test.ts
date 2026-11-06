import { describe, expect, it, vi } from "vitest";
import { ContractFunctionRevertedError, encodeAbiParameters, encodeErrorResult, encodeEventTopics, keccak256, stringToBytes, toHex, type Hex, type Log, type PublicClient } from "viem";
import { freshPayAbi } from "@/freshpay/abi";
import { WHITECHAIN_SEPOLIA_CHAIN_ID, WHITECHAIN_SEPOLIA_USDT, whitechainSepolia, whitechainTxUrl } from "@/freshpay/chain";
import {
  describeFreshPayError,
  findOrderPaid,
  formatUsdt,
  nextCheckoutStep,
  readOrderEvents,
  readOrderEventsFromExplorer,
  secondsUntilRelease,
  toOrder,
  toPaymentReference,
  verifyPayment,
} from "@/freshpay/sdk";
import { formatPrice } from "@/domain/listing";
import { isWhitechainPage, pageNetwork } from "@/lib/wallet/page-networks";

const contract = "0x00000000000000000000000000000000000f5e5a" as const;
const merchant = "0x1111111111111111111111111111111111111111" as const;
const buyer = "0x2222222222222222222222222222222222222222" as const;
const listingKey = `0x${"ab".repeat(32)}` as Hex;
const txHash = `0x${"cd".repeat(32)}` as Hex;

function paidLog(address: string = contract, amount = 12_500_000n): Log {
  return {
    address, blockHash: null, blockNumber: 10n, logIndex: 0, transactionHash: txHash, transactionIndex: 0, removed: false,
    topics: encodeEventTopics({ abi: freshPayAbi, eventName: "OrderPaid", args: { orderId: 1n, merchant, buyer } }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "uint64" }], [listingKey, amount, 1_000n]),
  } as Log;
}
const storedOrder = { buyer, paidAt: 900n, state: 1, merchant, releaseAfter: 1_000n, amount: 12_500_000n, refunded: 0n, ref: listingKey };

function fakeClient(overrides: Partial<Record<keyof PublicClient, unknown>> = {}) {
  return {
    getChainId: vi.fn().mockResolvedValue(WHITECHAIN_SEPOLIA_CHAIN_ID),
    getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", blockNumber: 10n, logs: [paidLog()] }),
    readContract: vi.fn().mockResolvedValue(storedOrder),
    ...overrides,
  } as unknown as PublicClient;
}

describe("Phase 10: Whitechain Sepolia configuration", () => {
  it("targets chain 1874 and the official Operate-track USDT", () => {
    expect(whitechainSepolia.id).toBe(1874);
    expect(whitechainSepolia.nativeCurrency.symbol).toBe("WBT");
    expect(whitechainSepolia.rpcUrls.default.http[0]).toBe("https://rpc.testnet.whitechain.io");
    expect(WHITECHAIN_SEPOLIA_USDT).toBe("0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7");
    expect(whitechainTxUrl(txHash)).toBe(`https://explorer.testnet.whitechain.io/tx/${txHash}`);
  });

  it("routes payment pages to Whitechain without touching Arkiv or ENS pages", () => {
    expect(pageNetwork("/checkout/0xabc")).toBe("whitechain");
    expect(pageNetwork("/receipt/7")).toBe("whitechain");
    expect(pageNetwork("/merchant/payments")).toBe("whitechain");
    expect(pageNetwork("/checkout-demo")).toBe("whitechain");
    expect(pageNetwork("/identity")).toBe("sepolia");
    expect(pageNetwork("/sell")).toBe("rabdi");
    expect(pageNetwork("/my-listings")).toBe("rabdi");
    expect(isWhitechainPage("/checkoutx")).toBe(false);
  });
});

describe("Phase 10: FreshPay SDK", () => {
  it("formats USDT exactly like Arkiv listing prices", () => {
    for (const minor of [0n, 1n, 12_500_000n, 1_234_567_891n]) expect(formatUsdt(minor)).toBe(formatPrice(minor).replace(/,/g, ""));
  });

  it("uses Arkiv entity keys as references and hashes merchant order IDs", () => {
    expect(toPaymentReference(listingKey.toUpperCase().replace("0X", "0x"))).toBe(listingKey);
    expect(toPaymentReference("invoice-42")).toBe(keccak256(stringToBytes("invoice-42")));
    expect(() => toPaymentReference("  ")).toThrow("reference");
  });

  it("plans network, balance, approval and payment steps in order", () => {
    const base = { chainId: 1874, balance: 20n, allowance: 0n, amount: 10n };
    expect(nextCheckoutStep({ ...base, chainId: 7794095 })).toBe("switch-network");
    expect(nextCheckoutStep({ ...base, balance: 9n })).toBe("insufficient-balance");
    expect(nextCheckoutStep(base)).toBe("approve");
    expect(nextCheckoutStep({ ...base, allowance: 10n })).toBe("pay");
  });

  it("maps contract orders and treats state None as missing", () => {
    expect(toOrder(1n, { ...storedOrder, state: 0 })).toBeNull();
    const order = toOrder(1n, storedOrder)!;
    expect(order.state).toBe("Paid");
    expect(secondsUntilRelease(order, 400)).toBe(600);
    expect(secondsUntilRelease(order, 2_000)).toBe(0);
  });

  it("only trusts OrderPaid events emitted by the configured contract", () => {
    expect(findOrderPaid([paidLog("0x9999999999999999999999999999999999999999")], contract)).toBeNull();
    expect(findOrderPaid([paidLog()], contract)).toMatchObject({ orderId: 1n, merchant, buyer, ref: listingKey, amount: 12_500_000n });
  });

  it("verifies a payment from the receipt and stored order", async () => {
    const result = await verifyPayment(fakeClient(), contract, txHash, { merchant, reference: listingKey, amount: 12_500_000n });
    expect(result.order).toMatchObject({ id: 1n, buyer, merchant, state: "Paid" });
    expect(result.blockNumber).toBe(10n);
  });

  it("rejects reverted, spoofed and mismatched payments", async () => {
    await expect(verifyPayment(fakeClient({ getTransactionReceipt: vi.fn().mockResolvedValue({ status: "reverted", logs: [] }) }), contract, txHash))
      .rejects.toThrow("reverted");
    await expect(verifyPayment(fakeClient({ getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", logs: [paidLog(merchant)] }) }), contract, txHash))
      .rejects.toThrow("did not pay");
    await expect(verifyPayment(fakeClient({ readContract: vi.fn().mockResolvedValue({ ...storedOrder, state: 0 }) }), contract, txHash))
      .rejects.toThrow("no record");
    await expect(verifyPayment(fakeClient(), contract, txHash, { amount: 1n })).rejects.toThrow("amount");
    await expect(verifyPayment(fakeClient(), contract, txHash, { merchant: buyer })).rejects.toThrow("different merchant");
    await expect(verifyPayment(fakeClient({ getChainId: vi.fn().mockResolvedValue(1) }), contract, txHash)).rejects.toThrow("Whitechain");
  });

  it("filters events by order on the node and decodes them oldest first", async () => {
    const log = paidLog();
    const request = vi.fn().mockResolvedValue([
      { ...log, blockNumber: toHex(12n), logIndex: toHex(1) },
      { ...log, blockNumber: toHex(11n), logIndex: toHex(0) },
      { ...log, blockNumber: null, logIndex: null },
    ]);
    const events = await readOrderEvents({ request, getBlockNumber: async () => 20n } as unknown as PublicClient, contract, { fromBlock: 5n }, { orderId: 1n });
    expect(events.map((event) => event.blockNumber)).toEqual([11n, 12n]);
    expect(events[0]).toMatchObject({ type: "paid", orderId: 1n, ref: listingKey, txHash });
    const [{ topics, fromBlock }] = request.mock.calls[0][0].params;
    expect(topics[0]).toHaveLength(3);
    expect(topics[1]).toBe(`0x${"0".repeat(63)}1`);
    expect(topics[2]).toBeNull();
    expect(fromBlock).toBe("0x5");
  });

  it("splits long ranges into windows the Whitechain RPC accepts", async () => {
    const request = vi.fn().mockResolvedValue([]);
    await readOrderEvents({ request } as unknown as PublicClient, contract, { fromBlock: 0n, toBlock: 25_000n });
    expect(request.mock.calls.map(([call]) => [call.params[0].fromBlock, call.params[0].toBlock]))
      .toEqual([["0x0", toHex(9_999n)], [toHex(10_000n), toHex(19_999n)], [toHex(20_000n), toHex(25_000n)]]);
  });

  it("reads order history from the Blockscout explorer API", async () => {
    const log = paidLog();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "1", message: "OK", result: [
      { ...log, topics: [...log.topics, null], blockNumber: toHex(10n), logIndex: toHex(0) },
      { ...log, address: merchant, blockNumber: toHex(11n), logIndex: toHex(0) },
    ] }) });
    const events = await readOrderEventsFromExplorer("https://explorer.testnet.whitechain.io/api", contract, { orderId: 1n }, fetcher);
    expect(events).toHaveLength(1); // The log from another address is ignored.
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get("topic1")).toBe(`0x${"0".repeat(63)}1`);
    expect(url.searchParams.get("address")).toBe(contract);

    const empty = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "0", message: "No logs found", result: [] }) });
    expect(await readOrderEventsFromExplorer("https://x.test/api", contract, { orderId: 2n }, empty)).toEqual([]);
    const down = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    await expect(readOrderEventsFromExplorer("https://x.test/api", contract, {}, down)).rejects.toThrow("502");
  });

  it("explains wallet errors in plain language", () => {
    const sold = new ContractFunctionRevertedError({ abi: freshPayAbi, functionName: "pay",
      data: encodeErrorResult({ abi: freshPayAbi, errorName: "ReferenceAlreadyPaid", args: [3n] }) });
    expect(describeFreshPayError(sold)).toBe("This item has already been paid for.");
    expect(describeFreshPayError(new Error("boom"))).toBe("boom");
    expect(describeFreshPayError("x")).toMatch(/could not be completed/);
  });
});
