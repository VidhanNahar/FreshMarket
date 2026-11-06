/**
 * Application-facing listing types. The repository converts Arkiv's typed attribute
 * wrappers and UTF-8 byte values into these plain fields before returning them to UI code.
 */

export const LISTING_STATUSES = ["available", "reserved", "sold"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Arkiv stores status as a string, so external writes still need an enum check on reads. */
export function isListingStatus(value: string): value is ListingStatus {
  return LISTING_STATUSES.some((status) => status === value);
}

// Suggested UI categories; the storage contract also permits other category strings.
export const LISTING_CATEGORIES = [
  "Electronics",
  "Vehicles",
  "Furniture",
  "Books",
  "Fashion",
  "Other",
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export interface Listing {
  id: string; // Arkiv Entity Key (Hex bytes32)
  seller: `0x${string}`; // Seller wallet address
  title: string;
  description: string;
  priceMinor: bigint; // Minor currency units (e.g. 500000 for ₹5,000.00)
  currency: string; // Display currency ("INR", "USD")
  category: string;
  city: string;
  imageUrl: string;
  status: ListingStatus;
  createdAt: number; // Seller-supplied Unix milliseconds, not Arkiv's creation block
  expiresAtBlock: bigint; // Arkiv expiration block height, NOT a Unix timestamp
  owner: `0x${string}`; // Arkiv entity owner
}

/** Form values before validation; the repository converts price to integer minor units. */
export interface CreateListingInput {
  seller: `0x${string}`;
  title: string;
  description: string;
  price: number; // Display price in major units (e.g. 2500)
  priceMinor?: number; // Minor currency units (e.g. 250000 for ₹2,500.00)
  currency?: string; // Default "INR"
  category: string;
  city: string;
  imageUrl: string;
  expirationDays?: number; // Default 7
}

/** Exact-match filters combined with AND; limit/offset describe one page of results. */
export interface ListingFilters {
  category?: string;
  city?: string;
  status?: ListingStatus | "all"; // Defaults to available; all includes seller history
  seller?: `0x${string}`;
  limit?: number;
  offset?: number;
  // Bounds are inclusive minor units; no currency conversion is performed.
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
 * Converts a non-negative major-unit price to cents/paisa, rounding half up.
 * This contract assumes 100 minor units per major unit; create validation excludes
 * currencies with a different scale. Zero is valid for free listings.
 */
export function toPriceMinor(price: number): bigint {
  if (price < 0 || !Number.isFinite(price)) {
    throw new Error("Price must be a non-negative finite number");
  }
  // Shift the decimal representation to avoid rounding 1.005 down to 1.00.
  const [coefficient, exponent = "0"] = price.toString().split("e");
  const minor = Math.round(Number(`${coefficient}e${Number(exponent) + 2}`));
  // Converting an already imprecise number to bigint cannot recover the missing digits.
  if (!Number.isSafeInteger(minor)) {
    throw new Error("Price in minor units must be a safe integer");
  }
  return BigInt(minor);
}

/**
 * Formats cents/paisa with exactly two fraction digits. Accept bigint for onchain
 * uint64 prices; number inputs must already represent an exact integer amount.
 */
export function formatPrice(priceMinor: bigint | number, currency = "INR"): string {
  if (typeof priceMinor === "number" && !Number.isSafeInteger(priceMinor)) {
    throw new Error("Price in minor units must be a safe integer");
  }
  const minor = BigInt(priceMinor);
  if (minor < 0n) throw new Error("Price cannot be negative");
  // Format the integer portion as bigint so even uint64 prices keep every digit.
  const formatter = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Let Intl supply currency symbols/grouping, then insert the exact minor-unit remainder.
  return formatter.formatToParts(minor / 100n)
    .map((part) => part.type === "fraction" ? (minor % 100n).toString().padStart(2, "0") : part.value)
    .join("");
}
