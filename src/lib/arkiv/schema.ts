import { defineSchema, str, addr, u64, bytes } from "@arkiv-network/sdk";

// Application contract version, not an SDK option. Breaking changes need a new schema tag.
export const LISTING_SCHEMA_VERSION = 2;

/**
 * Arkiv Schema: `freshmarket.listings.v2`
 *
 * Indexed attributes are the only ones usable in where() filters; every attribute is public.
 * Version 1 (`freshmarket.listings`) entities have different fields and are not read.
 * The SDK writes an indexed `arkiv.schema` tag automatically and filters on it in
 * `.from(listingSchema)`. Full field rules and the search plan live in arkiv/schema.md.
 */
export const listingSchema = defineSchema("freshmarket.listings.v2", {
  // --- Indexed attributes: one Arkiv query per search, never a client-side scan ---
  seller: addr().indexed(), // Discovery metadata; the protocol's $owner controls mutations.
  status: str().indexed(), // available | reserved | sold
  visibility: str().indexed(), // public | unlisted (unlisted = hidden from browse, still public)
  categoryPath: str().indexed(), // "pets/dogs/toys"; startsWith selects a whole branch
  brand: str().indexed(), // Search key, e.g. "lenovo"; "" when not applicable
  model: str().indexed(), // Search key, e.g. "thinkpadt14"; startsWith matches "thinkpad"
  condition: str().indexed(), // new | like-new | good | fair | for-parts
  city: str().indexed(), // City key, e.g. "mumbai"
  fulfilment: str().indexed(), // pickup | ship
  priceMinor: u64().indexed(), // USDT minor units, 6 decimals

  // --- Content: returned by reads, not filterable ---
  title: str(), // str is capped at 128 UTF-8 bytes
  description: bytes(), // UTF-8 text
  media: bytes(), // UTF-8 JSON array of https:// or bzz:// references
});

export type ListingSchema = typeof listingSchema;

/**
 * Arkiv Schema: `freshmarket.sellers`. A public seller directory keyed by ENS name.
 * The display name, avatar and bio live in the seller's ENS records, not here.
 */
export const sellerSchema = defineSchema("freshmarket.sellers", {
  ensName: str().indexed(), // "priya.freshmarket.eth"; trusted only if it resolves to $owner
  sellerType: str().indexed(), // individual | business (self-declared; badges come from ENS)
});

export type SellerSchema = typeof sellerSchema;

/**
 * Arkiv Schema: `freshmarket.reviews`. Owned by the buyer and tied to a FreshPay order,
 * which is the proof of purchase on Whitechain.
 */
export const reviewSchema = defineSchema("freshmarket.reviews", {
  seller: addr().indexed(), // Seller being reviewed
  orderId: u64().indexed(), // FreshPay order id
  sellerRating: u64(), // 1–5
  itemRating: u64(), // 1–5
  text: bytes(), // UTF-8 review text
});

export type ReviewSchema = typeof reviewSchema;
