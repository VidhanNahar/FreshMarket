/**
 * FreshPay SDK: framework-free reads, payment verification and error handling for the
 * FreshPay checkout contract. Depends only on viem, so any merchant backend can use it.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  decodeEventLog,
  formatUnits,
  hexToBigInt,
  hexToNumber,
  isAddressEqual,
  isHex,
  keccak256,
  pad,
  parseAbiItem,
  stringToBytes,
  toEventSelector,
  toHex,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { freshPayAbi } from "./abi";
import { USDT_DECIMALS, WHITECHAIN_SEPOLIA_CHAIN_ID } from "./chain";

export const ORDER_STATES = ["None", "Paid", "Released", "Refunded"] as const;
export type FreshPayOrderState = (typeof ORDER_STATES)[number];

export interface FreshPayOrder {
  id: bigint;
  buyer: Address;
  merchant: Address;
  amount: bigint; // Token minor units (USDT: 6 decimals)
  refunded: bigint;
  ref: Hex;
  paidAt: number; // Unix seconds
  releaseAfter: number; // Unix seconds
  state: FreshPayOrderState;
}

type RawOrder = {
  buyer: Address; paidAt: bigint; state: number; merchant: Address;
  releaseAfter: bigint; amount: bigint; refunded: bigint; ref: Hex;
};

export function toOrder(id: bigint, raw: RawOrder): FreshPayOrder | null {
  const state = ORDER_STATES[raw.state];
  if (!state || state === "None") return null;
  return {
    id, buyer: raw.buyer, merchant: raw.merchant, amount: raw.amount, refunded: raw.refunded, ref: raw.ref,
    paidAt: Number(raw.paidAt), releaseAfter: Number(raw.releaseAfter), state,
  };
}

/** USDT minor units to display text: 12_500_000n → "12.50 USDT". */
export function formatUsdt(minor: bigint): string {
  const [whole, fraction = ""] = formatUnits(minor, USDT_DECIMALS).split(".");
  return `${whole}.${fraction.padEnd(2, "0")} USDT`;
}

/** A 32-byte reference passes through (e.g. an Arkiv entity key); other strings are hashed. */
export function toPaymentReference(reference: string): Hex {
  if (isHex(reference) && reference.length === 66) return reference.toLowerCase() as Hex;
  if (!reference.trim()) throw new Error("A payment reference is required");
  return keccak256(stringToBytes(reference));
}

/** Seconds left before a merchant may release the order without the buyer. */
export function secondsUntilRelease(order: FreshPayOrder, nowSeconds = Math.floor(Date.now() / 1000)): number {
  return Math.max(0, order.releaseAfter - nowSeconds);
}

export type CheckoutStep = "switch-network" | "insufficient-balance" | "approve" | "pay";

/** The next thing the payer must do; recomputed from fresh chain reads before each step. */
export function nextCheckoutStep(input: { chainId?: number; balance: bigint; allowance: bigint; amount: bigint }): CheckoutStep {
  if (input.chainId !== WHITECHAIN_SEPOLIA_CHAIN_ID) return "switch-network";
  if (input.balance < input.amount) return "insufficient-balance";
  if (input.allowance < input.amount) return "approve";
  return "pay";
}

export async function readOrder(client: PublicClient, contract: Address, id: bigint): Promise<FreshPayOrder | null> {
  const raw = await client.readContract({ address: contract, abi: freshPayAbi, functionName: "getOrder", args: [id] });
  return toOrder(id, raw);
}

export async function readOrders(client: PublicClient, contract: Address, ids: readonly bigint[]): Promise<FreshPayOrder[]> {
  if (!ids.length) return [];
  const raw = await client.readContract({ address: contract, abi: freshPayAbi, functionName: "getOrders", args: [ids] });
  return raw.map((order, index) => toOrder(ids[index], order)).filter((order): order is FreshPayOrder => order !== null);
}

/** Every order paid to a merchant, newest first. */
export async function readMerchantOrders(client: PublicClient, contract: Address, merchant: Address) {
  const ids = await client.readContract({ address: contract, abi: freshPayAbi, functionName: "merchantOrderIds", args: [merchant] });
  return (await readOrders(client, contract, [...ids].reverse()));
}

/** Every order a buyer paid, newest first. */
export async function readBuyerOrders(client: PublicClient, contract: Address, buyer: Address) {
  const ids = await client.readContract({ address: contract, abi: freshPayAbi, functionName: "buyerOrderIds", args: [buyer] });
  return (await readOrders(client, contract, [...ids].reverse()));
}

/** The live order for a merchant reference, or null when it is unpaid or fully refunded. */
export async function readActiveOrder(client: PublicClient, contract: Address, merchant: Address, reference: Hex) {
  const id = await client.readContract({ address: contract, abi: freshPayAbi, functionName: "activeOrder", args: [merchant, reference] });
  return id === 0n ? null : readOrder(client, contract, id);
}

/** OrderPaid emitted by `contract` in these logs. Logs from any other address are ignored. */
export function findOrderPaid(logs: readonly Log[], contract: Address) {
  for (const log of logs) {
    if (!isAddressEqual(log.address, contract)) continue;
    try {
      const event = decodeEventLog({ abi: freshPayAbi, data: log.data, topics: log.topics });
      if (event.eventName === "OrderPaid") return event.args;
    } catch { /* Not a FreshPay event. */ }
  }
  return null;
}

export interface VerifiedPayment {
  order: FreshPayOrder;
  txHash: Hex;
  blockNumber: bigint;
}

/**
 * Confirms a payment from chain state, never from what a browser reports. The transaction must
 * have succeeded, emitted OrderPaid from `contract`, and the stored order must match `expected`.
 */
export async function verifyPayment(client: PublicClient, contract: Address, txHash: Hex,
  expected: { merchant?: Address; reference?: Hex; amount?: bigint } = {}): Promise<VerifiedPayment> {
  if ((await client.getChainId()) !== WHITECHAIN_SEPOLIA_CHAIN_ID) throw new Error("Payments are verified on Whitechain Sepolia only");
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("The payment transaction reverted");
  const paid = findOrderPaid(receipt.logs, contract);
  if (!paid) throw new Error("The transaction did not pay a FreshPay order");
  const order = await readOrder(client, contract, paid.orderId);
  if (!order) throw new Error("FreshPay has no record of this order");
  if (!isAddressEqual(order.buyer, paid.buyer) || order.ref !== paid.ref || order.amount !== paid.amount) {
    throw new Error("The stored order does not match the payment event");
  }
  if (expected.merchant && !isAddressEqual(order.merchant, expected.merchant)) throw new Error("The order pays a different merchant");
  if (expected.reference && order.ref.toLowerCase() !== expected.reference.toLowerCase()) throw new Error("The order is for a different reference");
  if (expected.amount !== undefined && order.amount !== expected.amount) throw new Error("The order amount does not match the price");
  return { order, txHash, blockNumber: receipt.blockNumber };
}

export type OrderEventType = "paid" | "released" | "refunded";
export interface OrderEvent {
  type: OrderEventType;
  orderId: bigint;
  merchant: Address;
  buyer: Address;
  amount: bigint;
  totalRefunded?: bigint;
  ref?: Hex;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
}

export const orderEvents = [
  parseAbiItem("event OrderPaid(uint64 indexed orderId, address indexed merchant, address indexed buyer, bytes32 ref, uint256 amount, uint64 releaseAfter)"),
  parseAbiItem("event OrderReleased(uint64 indexed orderId, address indexed merchant, address indexed buyer, uint256 amount)"),
  parseAbiItem("event OrderRefunded(uint64 indexed orderId, address indexed merchant, address indexed buyer, uint256 amount, uint256 totalRefunded)"),
] as const;

const EVENT_TYPES = { OrderPaid: "paid", OrderReleased: "released", OrderRefunded: "refunded" } as const;

type RpcLog = { data: Hex; topics: [Hex, ...Hex[]]; transactionHash: Hex | null; blockNumber: Hex | null; logIndex: Hex | null };

/** Decodes one raw `eth_getLogs` entry; pending or foreign logs return null. */
export function toOrderEvent(log: RpcLog): OrderEvent | null {
  if (!log.transactionHash || !log.blockNumber || !log.logIndex) return null;
  let event;
  try { event = decodeEventLog({ abi: orderEvents, data: log.data, topics: log.topics, strict: true }); }
  catch { return null; }
  const base = { orderId: event.args.orderId, merchant: event.args.merchant, buyer: event.args.buyer, amount: event.args.amount,
    txHash: log.transactionHash, blockNumber: hexToBigInt(log.blockNumber), logIndex: hexToNumber(log.logIndex), type: EVENT_TYPES[event.eventName] };
  if (event.eventName === "OrderPaid") return { ...base, ref: event.args.ref };
  if (event.eventName === "OrderRefunded") return { ...base, totalRefunded: event.args.totalRefunded };
  return base;
}

/**
 * FreshPay events in a block range, optionally for one order or merchant, oldest first.
 * All three events index (orderId, merchant, buyer) in the same topic positions, so one
 * node-side filter serves every event type.
 */
export async function readOrderEvents(client: PublicClient, contract: Address,
  range: { fromBlock: bigint; toBlock?: bigint }, filter: { orderId?: bigint; merchant?: Address } = {}): Promise<OrderEvent[]> {
  const topics = [
    orderEvents.map((event) => toEventSelector(event)),
    filter.orderId !== undefined ? pad(toHex(filter.orderId)) : null,
    filter.merchant ? pad(filter.merchant.toLowerCase() as Hex) : null,
  ];
  const logs = await client.request({
    method: "eth_getLogs",
    params: [{ address: contract, topics, fromBlock: toHex(range.fromBlock), toBlock: range.toBlock !== undefined ? toHex(range.toBlock) : "latest" }],
  }) as RpcLog[];
  return logs.map(toOrderEvent).filter((event): event is OrderEvent => event !== null)
    .sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
}

const REVERT_MESSAGES: Record<string, string> = {
  ReferenceAlreadyPaid: "This item has already been paid for.",
  QuoteExpired: "This checkout expired. Reload the page to get a fresh quote.",
  InvalidMerchant: "You cannot pay your own listing.",
  InvalidAmount: "The amount is not payable.",
  NotMerchant: "Only the merchant can refund this order.",
  ReleaseNotDue: "Funds are still held for the buyer. Release opens after the hold period.",
  RefundExceedsPayment: "The refund is larger than what remains on the order.",
  InvalidState: "The order is no longer in a state that allows this action.",
  UnexpectedTransferAmount: "The token did not transfer the exact amount.",
  ERC20InsufficientAllowance: "USDT approval is too low. Approve the amount and try again.",
  ERC20InsufficientBalance: "Not enough USDT in this wallet.",
};

/** A short, user-facing reason for a failed wallet or contract call. */
export function describeFreshPayError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) return "You rejected the request in your wallet.";
    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
      if (revert.reason) return revert.reason;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "The payment could not be completed.";
}
