import { defineSchema, str, addr, u64, bytes } from "@arkiv-network/sdk";

// Application contract version, not an SDK option. Breaking changes need a new schema tag.
export const LISTING_SCHEMA_VERSION = 1;

/**
 * Arkiv Schema: `freshmarket.listings`
 *
 * Defines the decentralized schema for FreshMarket portable listings.
 * - Indexed fields allow direct filtering on Arkiv RPC queries without full-table scans.
 * - Non-indexed fields store content payloads (titles, descriptions, image references).
 * The SDK writes an indexed `arkiv.schema` tag automatically and filters on it in
 * `.from(listingSchema)`. Full field limits and migration rules live in arkiv/schema.md.
 */
export const listingSchema = defineSchema("freshmarket.listings", {
  // --- Indexed Attributes (Used for marketplace discovery & seller filters) ---
  seller: addr().indexed(), // Discovery metadata; the protocol's $owner controls mutations.
  category: str().indexed(),
  status: str().indexed(), // Enum validation lives in the domain/repository, not str().
  city: str().indexed(),
  priceMinor: u64().indexed(), // Integer minor units (e.g. paisa/cents)

  // Unindexed attributes are still public and returned by select().from(listingSchema).
  title: str(),
  // str is capped at 128 UTF-8 bytes; longer text is stored as UTF-8 bytes.
  description: bytes(),
  imageUrl: bytes(),
  currency: str().default("INR"), // Applied on SDK creates when the value is omitted.
  createdAt: u64(), // Application Unix milliseconds; system $createdAt is a block height.
});

export type ListingSchema = typeof listingSchema;
