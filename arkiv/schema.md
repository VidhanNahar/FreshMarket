# Arkiv Schema Specification

- **Network:** Arkiv Rabdi Testnet, chain ID `7794095`
- **Schemas:** `freshmarket.listings.v2` (`LISTING_SCHEMA_VERSION = 2`), `freshmarket.sellers`, `freshmarket.reviews`
- **Source:** [`src/lib/arkiv/schema.ts`](../src/lib/arkiv/schema.ts); SECOND LOOK declares its own copy in [`storefront/src/reader.ts`](../storefront/src/reader.ts)
- **Ownership:** the signing wallet is each entity's `$owner`; only it can patch, extend or delete

Each schema is an SDK convention, not a centrally registered table. The SDK writes an indexed `arkiv.schema` tag and `.from(schema)` filters on it. Anyone can write the same tag, so readers validate every row (see [Reader rules](#reader-rules)). Incompatible changes need a new tag: version 1 (`freshmarket.listings`) used different fields and is no longer read.

## Which records live where

| Record | Where | Why |
| --- | --- | --- |
| Listing, seller directory, review | **Arkiv** | Public, owned by a wallet, filtered by indexed fields, and expiring on their own |
| Seller name, profile text, verified badge | ENS (Sepolia) | `priya.freshmarket.eth`; verification is a FreshMarket-issued subname the seller cannot edit |
| Payment, one-sale-per-listing lock, orders, refunds | FreshPay on Whitechain (chain 1874) | Money and atomic stock need a contract. See [`whitechain/README.md`](../whitechain/README.md). The Arkiv `priceMinor` is the checkout price; FreshPay never writes to Arkiv |
| Shipping address, dispute evidence | Private store | Arkiv data is public |

## `freshmarket.listings.v2`

Owner: seller · Expiry: chosen at publish (15-minute demo, 3, 7, 14 or 30 days; default 7), extendable.

**Indexed** attributes are the only ones `where()` can filter. Unindexed attributes are still public.

| Attribute | SDK type | Indexed | Values / encoding |
| --- | --- | --- | --- |
| `seller` | `addr` | ✅ | Seller wallet. Must equal `$owner` |
| `status` | `str` | ✅ | `available` \| `reserved` \| `sold` |
| `visibility` | `str` | ✅ | `public` (in browse) \| `unlisted` (link only; still public on Arkiv) |
| `categoryPath` | `str` | ✅ | Path from [`shared/categories.ts`](../shared/categories.ts), e.g. `pets/dogs/toys`. `startsWith` selects a whole branch |
| `brand` | `str` | ✅ | Search key: lowercase letters/digits only (`Lenovo` → `lenovo`); `""` if none |
| `model` | `str` | ✅ | Search key (`ThinkPad T14` → `thinkpadt14`); `startsWith` matches `thinkpad` |
| `condition` | `str` | ✅ | `new` \| `like-new` \| `good` \| `fair` \| `for-parts` |
| `city` | `str` | ✅ | City key: trimmed, single-spaced, lowercase (`Navi Mumbai` → `navi mumbai`). Coarse city only |
| `fulfilment` | `str` | ✅ | `pickup` \| `ship` |
| `priceMinor` | `u64` | ✅ | USDT minor units, 6 decimals (`12.50 USDT` = `12500000`). One currency, so ranges never mix currencies |
| `title` | `str` | | ≤ 80 characters and ≤ 128 UTF-8 bytes |
| `description` | `bytes` | | UTF-8 text, ≤ 1,000 characters |
| `media` | `bytes` | | UTF-8 JSON array of 1–8 references: credential-free `https://` URLs or `bzz://<64-hex>` Swarm references |

Removed from version 1: `category` (replaced by `categoryPath`), `currency` (always USDT), `imageUrl` (now `media`), `createdAt` (use system `$createdAt`, a block height).

13 attributes plus the schema tag, under Arkiv's limit of 32. All `str` values are capped at 128 UTF-8 bytes; the repository validates byte lengths separately from character counts.

## `freshmarket.sellers`

Owner: seller · Expiry: 180 days (`ExpirationTime.fromDays(180)`; Arkiv's maximum lifetime is about 182 days).

| Attribute | SDK type | Indexed | Values |
| --- | --- | --- | --- |
| `ensName` | `str` | ✅ | `priya.freshmarket.eth`. Written only if it already resolves to the signing wallet |
| `sellerType` | `str` | ✅ | `individual` \| `business` (self-declared; the verified badge comes from ENS) |

A public directory keyed by ENS name. Display name, avatar and bio live in the seller's ENS records, so they are not stored twice. Readers keep the newest record per `$owner`.

## `freshmarket.reviews`

Owner: buyer · Expiry: 180 days, so reputation is a trailing six-month window.

| Attribute | SDK type | Indexed | Values |
| --- | --- | --- | --- |
| `seller` | `addr` | ✅ | Seller being reviewed |
| `orderId` | `u64` | ✅ | FreshPay order on Whitechain: the proof of purchase |
| `sellerRating` | `u64` | | 1–5 |
| `itemRating` | `u64` | | 1–5 |
| `text` | `bytes` | | UTF-8, ≤ 2,000 characters |

Buyers write reviews from the FreshPay receipt (`/receipt/[orderId]`) once the order is released or refunded, signing on Rabdi; listing pages show the seller's verified reviews and averages. A review counts only if the FreshPay order names the reviewer (`$owner`) as buyer and this `seller`, and its state is `Released` or `Refunded` (a refund does not erase a review). Readers keep the newest review per (buyer, order). FreshPay order IDs are sequential `uint64` values starting at 1, so they fit this attribute. Until `NEXT_PUBLIC_FRESHPAY_ADDRESS` is configured, reviews are read as unverified and rating summaries count none of them.

## Which index answers which search

Every browse search adds `status = available` and `visibility = public`.

| Search | Example | Arkiv condition |
| --- | --- | --- |
| Category branch | Pets › Dogs | `startsWith('categoryPath', 'pets/dogs')` |
| By meaning, spacing, typos | `dogtoy`, `dog toy`, `dgo toy` | Query → `pets/dogs/toys` via `shared/categories.ts` → `startsWith` |
| Ambiguous word | `toy` | `or(startsWith(… 'pets/dogs/toys'), startsWith(… 'pets/cats/toys'), startsWith(… 'kids/toys'))` |
| Brand or model | `lenovo`, `iphone13` | `or(eq('brand', key), startsWith('model', key))` |
| City | Mumbai | `eq('city', 'mumbai')` |
| Price range | 5–20 USDT | `gte/lte('priceMinor', u64(…))` |
| Condition, delivery | Like new, pickup | `eq('condition', …)`, `eq('fulfilment', …)` |
| A seller's store | | `eq('seller', addr(…))` + `.ownedBy(…)` |
| A Safe Deal / detail link | `/listing/0x…` | `getEntity($key)` |
| Seller by ENS name | `priya.freshmarket.eth` | `eq('ensName', …)` on `freshmarket.sellers`, then ENS forward resolution |
| Seller's reviews | | `eq('seller', addr(…))` on `freshmarket.reviews` |

Words left over after category and brand/model resolution (`red`, `barely used`) are matched in the reader against title, description, brand and model, over the already-narrowed candidates. Matching ignores spacing, accepts prefixes and tolerates one typo per word (`latpop` → `laptop`). If a single-category search finds nothing, the reader retries one level up (`pets/dogs/toys` → `pets/dogs`) and labels the result. Fully typo-tolerant free-text search over millions of listings needs a separate, rebuildable search index; Arkiv stays the source of truth.

## Reader rules

- A listing is dropped unless `seller == $owner` and every enum (`status`, `visibility`, `condition`, `fulfilment`) is a known value. Media references that are not safe `https://` or `bzz://` values are discarded.
- Unknown `categoryPath` values from other writers are shown as stored, not rejected.
- A seller name is shown only if `getEnsAddress(ensName)` returns the seller's wallet (the pinned ENSv2 Universal Resolver from `shared/ens-deployment.json`, Sepolia). A verified badge requires `<label>.verified.freshmarket.eth` to resolve to the same wallet.
- Price filters are inclusive USDT minor units.

## Queries

```ts
import { addr, u64 } from '@arkiv-network/sdk';
import { asc, eq, lte, or, startsWith } from '@arkiv-network/sdk/query';
import { listingSchema } from '@/lib/arkiv/schema';

// "dogtoy" in Mumbai under 10 USDT: one indexed query, no client-side scan.
const dogToys = await publicClient.select().from(listingSchema)
  .where(eq('status', 'available'))
  .where(eq('visibility', 'public'))
  .where(startsWith('categoryPath', 'pets/dogs/toys'))
  .where(eq('city', 'mumbai'))
  .where(lte('priceMinor', u64(10_000_000n)))
  .orderBy(asc('$key')).limit(20).fetch();

// Brand or model lookup.
const thinkpads = await publicClient.select().from(listingSchema)
  .where(or(eq('brand', 'thinkpad'), startsWith('model', 'thinkpad')))
  .limit(20).fetch();

// Seller inventory, including reserved/sold and unlisted items.
const sellerListings = await publicClient.select().from(listingSchema)
  .where(eq('seller', addr(sellerAddress)))
  .ownedBy(sellerAddress)
  .orderBy(asc('$key')).limit(20).fetch();
```

Run the same query without the app: `npm run query:listings` (add `CATEGORY=pets/dogs` to filter a branch).

`search()` returns one page (default 20, SDK range 1–100) in ascending key order. `searchAll()` pages through every match for the indexed filters, bounded by `MAX_CATALOGUE_MATCHES` and a time budget. Offsets count rows the SDK skips as schema mismatches, so a page can hold fewer listings than requested.

## Expiration and lifecycle

Creates use `ExpirationTime.fromDays(n)`; listings default to 7 days. **`$expiresAt` is a block height, not a Unix timestamp**; wall-clock estimates use Rabdi's two-second block target. `$createdAt` and `$updatedAt` are also block heights.

Expired entities disappear from queries. Reserved and sold are explicit status changes, not expiry. Extending an entity sets a new deadline: FreshMarket reads the current `$expiresAt` and calls `extendEntity` with `ExpirationTime.atBlock(current + additionalBlocks)`.

## Privacy

Arkiv entities and their unindexed content are public, including unlisted listings. Listings carry only a coarse city. Sellers must not enter street addresses, phone numbers or contact details in free text. Swarm files are public too; encrypted key-bearing references are rejected.

- [Official Arkiv documentation](https://docs.arkiv.network/)
- [Arkiv TypeScript SDK source](https://github.com/Arkiv-Network/arkiv-sdk-js) (implementation checked against installed SDK 1.0.1)
