import { ExpirationTime, addr, u64, type CreateEntityValues, type FullRow, type PublicArkivClient, type WalletArkivClient } from "@arkiv-network/sdk";
import { asc, eq } from "@arkiv-network/sdk/query";
import { hexToString, isAddressEqual, stringToBytes, type Address } from "viem";
import { ARKIV_RABDI_CHAIN_ID, getArkivPublicClient } from "@/lib/arkiv/chain";
import { reviewSchema } from "@/lib/arkiv/schema";
import { freshPayConfig } from "@/lib/freshpay/config";
import { freshPayOrderLookup } from "@/lib/freshpay/orders";

/** About six months, Arkiv's maximum lifetime: reputation is a trailing window. */
export const REVIEW_DAYS = 180;
export const MAX_REVIEW_TEXT = 2000;

export type OrderState = "Paid" | "Released" | "Refunded" | "Disputed";

/** A FreshPay order on Whitechain, the proof of purchase behind a review. */
export interface PurchaseOrder {
  buyer: Address;
  seller: Address;
  state: OrderState;
}

/** Reads FreshPay orders on Whitechain (`freshPayOrderLookup`). */
export interface OrderLookup {
  getOrder(orderId: bigint): Promise<PurchaseOrder | null>;
}

export interface Review {
  id: string;
  buyer: Address; // Arkiv $owner
  seller: Address;
  orderId: bigint;
  sellerRating: number;
  itemRating: number;
  text: string;
  updatedAtBlock: bigint;
  /** True only when the FreshPay order names this buyer and seller and has settled or been refunded. */
  verified: boolean;
}

export interface CreateReviewInput {
  seller: Address;
  orderId: bigint;
  sellerRating: number;
  itemRating: number;
  text: string;
}

export type ReviewWalletClient = Pick<WalletArkivClient, "account" | "chain" | "createEntity">;
type ReviewRow = FullRow<typeof reviewSchema>;

const isRating = (value: number) => Number.isInteger(value) && value >= 1 && value <= 5;

/** A refund does not erase a review: refunded purchases still prove the buyer paid. */
export function orderAllowsReview(order: PurchaseOrder | null, buyer: Address, seller: Address): boolean {
  return Boolean(order && isAddressEqual(order.buyer, buyer) && isAddressEqual(order.seller, seller) &&
    (order.state === "Released" || order.state === "Refunded"));
}

function mapRow(row: ReviewRow): Omit<Review, "verified"> | null {
  const sellerRating = Number(row.sellerRating.value);
  const itemRating = Number(row.itemRating.value);
  if (!isRating(sellerRating) || !isRating(itemRating) || row.orderId.value === 0n) return null;
  return {
    id: row.$key, buyer: row.$owner, seller: row.seller.value, orderId: row.orderId.value,
    sellerRating, itemRating, text: hexToString(row.text.value), updatedAtBlock: row.$updatedAt,
  };
}

export interface RatingSummary {
  count: number;
  sellerAverage: number | null;
  itemAverage: number | null;
}

/** Averages count verified reviews only, and always travel with their count. */
export function summarizeReviews(reviews: readonly Review[]): RatingSummary {
  const verified = reviews.filter((review) => review.verified);
  const average = (pick: (review: Review) => number) =>
    verified.length ? Math.round((verified.reduce((sum, review) => sum + pick(review), 0) / verified.length) * 10) / 10 : null;
  return { count: verified.length, sellerAverage: average((review) => review.sellerRating), itemAverage: average((review) => review.itemRating) };
}

/** Buyer-owned reviews tied to FreshPay orders (`freshmarket.reviews`). */
export class ArkivReviewRepository {
  constructor(private readonly publicClient?: PublicArkivClient, private readonly orders?: OrderLookup) {}

  async create(input: CreateReviewInput, wallet: ReviewWalletClient) {
    if (!wallet?.account || wallet.chain?.id !== ARKIV_RABDI_CHAIN_ID) {
      throw new Error("Connect a wallet on Arkiv Rabdi before writing a review");
    }
    if (input.orderId <= 0n) throw new Error("A review needs the FreshPay order it is about");
    if (!isRating(input.sellerRating) || !isRating(input.itemRating)) throw new Error("Ratings must be whole numbers from 1 to 5");
    const text = input.text.trim();
    if (text.length > MAX_REVIEW_TEXT) throw new Error(`Reviews cannot exceed ${MAX_REVIEW_TEXT} characters`);
    if (this.orders && !orderAllowsReview(await this.orders.getOrder(input.orderId), wallet.account.address, input.seller)) {
      throw new Error("Only the buyer of a settled or refunded order can review it");
    }
    const values: CreateEntityValues<typeof reviewSchema> = {
      seller: addr(input.seller),
      orderId: u64(input.orderId),
      sellerRating: u64(BigInt(input.sellerRating)),
      itemRating: u64(BigInt(input.itemRating)),
      text: stringToBytes(text),
    };
    return wallet.createEntity(reviewSchema, values, { expiration: ExpirationTime.fromDays(REVIEW_DAYS) });
  }

  /**
   * Reviews of one seller, newest per (buyer, order). Without an order lookup every review is
   * returned unverified, and summaries count none of them.
   */
  async listForSeller(seller: Address): Promise<Review[]> {
    const client = this.publicClient ?? getArkivPublicClient();
    const result = await client.select().from(reviewSchema).where(eq("seller", addr(seller)))
      .orderBy(asc("$key")).limit(100).fetch();
    const newest = new Map<string, Omit<Review, "verified">>();
    for (const review of result.entities.map(mapRow)) {
      if (!review) continue;
      const key = `${review.buyer.toLowerCase()}:${review.orderId}`;
      const current = newest.get(key);
      if (!current || review.updatedAtBlock > current.updatedAtBlock) newest.set(key, review);
    }
    return Promise.all([...newest.values()].map(async (review) => ({
      ...review,
      verified: this.orders ? orderAllowsReview(await this.orders.getOrder(review.orderId), review.buyer, review.seller) : false,
    })));
  }
}

// Reviews verify against FreshPay orders once the contract is configured; until then they read unverified.
export const reviewRepository = new ArkivReviewRepository(undefined, freshPayConfig.contract ? freshPayOrderLookup : undefined);
