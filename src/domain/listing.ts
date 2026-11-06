/**
 * Application-facing listing types. The repository converts Arkiv's typed attribute
 * wrappers and UTF-8 byte values into these plain fields before returning them to UI code.
 */
import { squash } from "../../shared/search";

export const LISTING_STATUSES = ["available", "reserved", "sold"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_CONDITIONS = ["new", "like-new", "good", "fair", "for-parts"] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const LISTING_FULFILMENTS = ["pickup", "ship"] as const;
export type ListingFulfilment = (typeof LISTING_FULFILMENTS)[number];

/** Unlisted listings are hidden from browse but still public on Arkiv to anyone who queries. */
export const LISTING_VISIBILITIES = ["public", "unlisted"] as const;
export type ListingVisibility = (typeof LISTING_VISIBILITIES)[number];

export const CONDITION_LABELS: Record<ListingCondition, string> = {
  new: "New", "like-new": "Like new", good: "Good", fair: "Fair", "for-parts": "For parts",
};
export const FULFILMENT_LABELS: Record<ListingFulfilment, string> = { pickup: "Local pickup", ship: "Shipping" };

/** Every listing is priced in USDT, the FreshPay settlement token on Whitechain. */
export const PRICE_CURRENCY = "USDT";
export const PRICE_DECIMALS = 6;
const PRICE_SCALE = 10n ** BigInt(PRICE_DECIMALS);
export const MAX_MEDIA_ITEMS = 8;

const isOneOf = <T extends string>(values: readonly T[]) => (value: string): value is T => values.some((item) => item === value);

/** Arkiv stores enums as strings, so external writes still need checks on reads. */
export const isListingStatus = isOneOf(LISTING_STATUSES);
export const isListingCondition = isOneOf(LISTING_CONDITIONS);
export const isListingFulfilment = isOneOf(LISTING_FULFILMENTS);
export const isListingVisibility = isOneOf(LISTING_VISIBILITIES);

/** Indexed brand/model keys: lowercase letters and digits only ("ThinkPad T14" → "thinkpadt14"). */
export const toSearchKey = squash;

/** Indexed city key: lowercase single-spaced words, so "  Navi   Mumbai" equals "navi mumbai". */
export function toCityKey(city: string): string {
  return city.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function displayCity(cityKey: string): string {
  return cityKey.replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-US"));
}

export interface Listing {
  id: string; // Arkiv Entity Key (Hex bytes32)
  seller: `0x${string}`; // Seller wallet address
  owner: `0x${string}`; // Arkiv entity owner
  status: ListingStatus;
  visibility: ListingVisibility;
  categoryPath: string; // e.g. "pets/dogs/toys"
  brand: string; // Search key, "" when not applicable
  model: string; // Search key, "" when not applicable
  condition: ListingCondition;
  city: string; // City key, e.g. "mumbai"
  fulfilment: ListingFulfilment;
  priceMinor: bigint; // USDT minor units (6 decimals): 12_500_000n = 12.50 USDT
  title: string;
  description: string;
  media: string[]; // https:// or bzz:// references; may be empty if all were invalid
  createdAtBlock: bigint; // Arkiv $createdAt block height
  expiresAtBlock: bigint; // Arkiv expiration block height, NOT a Unix timestamp
}

/** Form values before validation; the repository converts price to integer minor units. */
export interface CreateListingInput {
  seller: `0x${string}`;
  title: string;
  description: string;
  price: number; // Display price in USDT (e.g. 12.5)
  categoryPath: string;
  brand?: string;
  model?: string;
  condition: ListingCondition;
  city: string;
  fulfilment: ListingFulfilment;
  visibility?: ListingVisibility; // Default "public"
  media: string[];
  expirationDays?: number; // Default 7
}

/** Exact-match filters combined with AND; limit/offset describe one page of results. */
export interface ListingFilters {
  /** startsWith filters; several are combined with OR (e.g. dog toys OR cat toys). */
  categoryPaths?: string[];
  /** Matches brand exactly or model by prefix, as search keys. */
  brandOrModel?: string;
  city?: string;
  condition?: ListingCondition;
  fulfilment?: ListingFulfilment;
  status?: ListingStatus | "all"; // Defaults to available; all includes seller history
  visibility?: ListingVisibility | "all"; // Defaults to public; all includes unlisted
  seller?: `0x${string}`;
  limit?: number;
  offset?: number;
  // Bounds are inclusive USDT minor units.
  minPriceMinor?: bigint;
  maxPriceMinor?: bigint;
}

/** Confirmed SDK write metadata; expiry remains a block height, never a timestamp. */
export interface ListingWriteReceipt {
  entityKey: `0x${string}`;
  txHash: `0x${string}`;
  expiresAt: bigint;
}

/**
 * Converts a non-negative USDT price to minor units (6 decimals), rounding half up.
 * Zero is valid for free listings.
 */
export function toPriceMinor(price: number): bigint {
  if (price < 0 || !Number.isFinite(price)) {
    throw new Error("Price must be a non-negative finite number");
  }
  // Shift the decimal representation to avoid binary rounding (1.0000005 stays exact).
  const [coefficient, exponent = "0"] = price.toString().split("e");
  const minor = Math.round(Number(`${coefficient}e${Number(exponent) + PRICE_DECIMALS}`));
  // Converting an already imprecise number to bigint cannot recover the missing digits.
  if (!Number.isSafeInteger(minor)) {
    throw new Error("Price in minor units must be a safe integer");
  }
  return BigInt(minor);
}

/** Exact decimal text for an editable price input, e.g. 12_500_000n → "12.5". */
export function toPriceInput(priceMinor: bigint): string {
  const fraction = (priceMinor % PRICE_SCALE).toString().padStart(PRICE_DECIMALS, "0").replace(/0+$/, "");
  return `${priceMinor / PRICE_SCALE}${fraction ? `.${fraction}` : ""}`;
}

/**
 * Formats USDT minor units exactly, with 2–6 fraction digits: 12_500_000n → "12.50 USDT".
 * Accepts bigint for onchain uint64 prices; numbers must be exact integer amounts.
 */
export function formatPrice(priceMinor: bigint | number): string {
  if (typeof priceMinor === "number" && !Number.isSafeInteger(priceMinor)) {
    throw new Error("Price in minor units must be a safe integer");
  }
  const minor = BigInt(priceMinor);
  if (minor < 0n) throw new Error("Price cannot be negative");
  const whole = new Intl.NumberFormat("en-US").format(minor / PRICE_SCALE);
  const fraction = (minor % PRICE_SCALE).toString().padStart(PRICE_DECIMALS, "0").replace(/0{1,4}$/, "");
  return `${whole}.${fraction.padEnd(2, "0")} ${PRICE_CURRENCY}`;
}
