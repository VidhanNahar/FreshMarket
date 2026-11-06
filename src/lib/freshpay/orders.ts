import { queryOptions } from "@tanstack/react-query";
import { isAddressEqual, type Address, type Hex } from "viem";
import type { Listing } from "@/domain/listing";
import {
  readActiveOrder, readBuyerOrders, readMerchantOrders, readOrder, readOrderEvents, readOrderEventsFromExplorer,
  WHITECHAIN_SEPOLIA_CHAIN_ID, WHITECHAIN_SEPOLIA_EXPLORER_URL,
  type FreshPayOrder,
} from "@/freshpay";
import type { OrderLookup, PurchaseOrder } from "@/services/review-repository";
import { whitechainPublicClient } from "./client";
import { freshPayConfig } from "./config";

/** FreshPay must be deployed and configured before any order read or checkout. */
export function requireFreshPay(): Address {
  if (!freshPayConfig.contract) throw new Error("FreshPay checkout is not deployed yet");
  return freshPayConfig.contract;
}

export const orderKeys = {
  all: ["freshpay", WHITECHAIN_SEPOLIA_CHAIN_ID] as const,
  order: (id: bigint) => [...orderKeys.all, "order", id.toString()] as const,
  events: (id: bigint) => [...orderKeys.all, "events", id.toString()] as const,
  merchant: (merchant: Address) => [...orderKeys.all, "merchant", merchant.toLowerCase()] as const,
  buyer: (buyer: Address) => [...orderKeys.all, "buyer", buyer.toLowerCase()] as const,
  active: (merchant: Address, listingId: string) => [...orderKeys.all, "active", merchant.toLowerCase(), listingId.toLowerCase()] as const,
};

// Contract state is the record of payment; these reads never use the wallet's RPC.
const orderReadPolicy = { staleTime: 5_000, retry: 2, enabled: Boolean(freshPayConfig.contract) };

export const orderQueryOptions = (id: bigint) => queryOptions({ ...orderReadPolicy, queryKey: orderKeys.order(id),
  queryFn: () => readOrder(whitechainPublicClient, requireFreshPay(), id) });
/** Order history from the Whitechain explorer; if it is down, scan the node from the deploy block. */
export async function loadOrderEvents(id: bigint) {
  const contract = requireFreshPay();
  try {
    return await readOrderEventsFromExplorer(`${WHITECHAIN_SEPOLIA_EXPLORER_URL}/api`, contract, { orderId: id });
  } catch {
    return readOrderEvents(whitechainPublicClient, contract, { fromBlock: freshPayConfig.deployBlock }, { orderId: id });
  }
}
export const orderEventsQueryOptions = (id: bigint) => queryOptions({ ...orderReadPolicy, queryKey: orderKeys.events(id),
  queryFn: () => loadOrderEvents(id) });
export const merchantOrdersQueryOptions = (merchant: Address) => queryOptions({ ...orderReadPolicy, queryKey: orderKeys.merchant(merchant),
  queryFn: () => readMerchantOrders(whitechainPublicClient, requireFreshPay(), merchant) });
export const buyerOrdersQueryOptions = (buyer: Address) => queryOptions({ ...orderReadPolicy, queryKey: orderKeys.buyer(buyer),
  queryFn: () => readBuyerOrders(whitechainPublicClient, requireFreshPay(), buyer) });
export const activeOrderQueryOptions = (merchant: Address, listingId: string) => queryOptions({ ...orderReadPolicy,
  queryKey: orderKeys.active(merchant, listingId),
  queryFn: () => readActiveOrder(whitechainPublicClient, requireFreshPay(), merchant, listingId.toLowerCase() as Hex) });

export type CheckoutBlock =
  | "not-deployed" | "missing" | "expired" | "not-available" | "foreign-owner" | "free" | "own-listing" | "already-paid";

/**
 * Why a listing cannot be bought right now, or null when checkout may start. The Arkiv record
 * decides price, seller and status; FreshPay's live order for the listing decides "already paid".
 */
export function checkoutBlock(input: {
  contract: Address | null; listing: Listing | null | undefined; currentBlock?: bigint;
  activeOrder?: FreshPayOrder | null; viewer?: Address;
}): CheckoutBlock | null {
  const { listing } = input;
  if (!input.contract) return "not-deployed";
  if (!listing) return "missing";
  if (input.currentBlock !== undefined && listing.expiresAtBlock <= input.currentBlock) return "expired";
  if (listing.status !== "available") return "not-available";
  if (!isAddressEqual(listing.seller, listing.owner)) return "foreign-owner";
  if (listing.priceMinor <= 0n) return "free";
  if (input.viewer && isAddressEqual(input.viewer, listing.seller)) return "own-listing";
  if (input.activeOrder) return "already-paid";
  return null;
}

export const CHECKOUT_BLOCK_MESSAGES: Record<CheckoutBlock, string> = {
  "not-deployed": "USDT checkout is not configured on this deployment yet.",
  missing: "This listing is no longer on Arkiv. It may have expired or been removed by the seller.",
  expired: "This listing has expired on Arkiv, so it can no longer be bought.",
  "not-available": "The seller has marked this listing reserved or sold.",
  "foreign-owner": "The listing's seller field does not match its Arkiv owner, so it cannot be paid.",
  free: "This listing is free. Arrange pickup with the seller instead of paying.",
  "own-listing": "This is your own listing. Switch to a buyer wallet to test checkout.",
  "already-paid": "Someone has already paid for this item. The seller still needs to update the listing.",
};

/** Proof of purchase for `freshmarket.reviews`: the order names buyer and seller onchain. */
export const freshPayOrderLookup: OrderLookup = {
  async getOrder(orderId: bigint): Promise<PurchaseOrder | null> {
    const order = await readOrder(whitechainPublicClient, requireFreshPay(), orderId);
    if (!order) return null;
    return { buyer: order.buyer, seller: order.merchant, state: order.state === "Released" || order.state === "Refunded" ? order.state : "Paid" };
  },
};
