# Arkiv Schema Specification: `freshmarket.listings`

- **Version:** 1 (`LISTING_SCHEMA_VERSION`), specification 1.0.0
- **Network:** Arkiv Rabdi Testnet, chain ID `7794095`
- **Schema tag:** indexed `arkiv.schema = str('freshmarket.listings')`, written automatically by the SDK
- **Ownership:** the signing wallet is the entity owner; `seller` must match that owner

## Schema and versioning

The schema is an SDK convention, not a centrally registered table. Any storefront can query it with `@arkiv-network/sdk`. Anyone can also write the same schema tag, so the tag alone does not authenticate a seller. FreshMarket checks `seller` against `$owner` on reads and against the wallet account on creates. Seller searches filter both attributes. Ownership transfers must update `seller` to remain compatible with this contract.

`freshmarket.listings` identifies version 1. `LISTING_SCHEMA_VERSION = 1` records that contract in code; the SDK has no separate schema-version option. Incompatible future changes must use a new schema tag (for example `freshmarket.listings.v2`) and an explicit migration/read strategy rather than reinterpret version 1 entities.

## Indexed attributes

| Attribute | SDK type | Encoding / purpose |
| --- | --- | --- |
| `seller` | `addr().indexed()` | 20-byte wallet address, supplied as `addr(address)`. Seller discovery; ownership comes from `$owner`. |
| `category` | `str().indexed()` | Public item category, such as `Electronics` or `Furniture`. |
| `status` | `str().indexed()` | `available`, `reserved`, or `sold`; the repository validates these values because `str()` does not enforce an enum. |
| `city` | `str().indexed()` | Public coarse location, such as `Mumbai`; never a private street address. |
| `priceMinor` | `u64().indexed()` | Unsigned integer minor units, supplied as `u64(...)`; 100 minor units per major unit (paisa/cents). Supports numerical range queries. |

All `str` values have an Arkiv limit of **128 UTF-8 bytes**, independently of JavaScript character counts. The repository trims category, city, and title and validates them with `str()` before writing.

## Unindexed attributes

These remain public and are selected by reads; unindexed does not mean private. They avoid unnecessary indexes. Arkiv can sort non-byte attributes without indexing them, but only indexed attributes can be used in `where()` filters.

| Attribute | SDK type | Encoding / purpose |
| --- | --- | --- |
| `title` | `str()` | Required short title, at most 80 JavaScript string code units **and** 128 UTF-8 bytes. |
| `description` | `bytes()` | Required UTF-8 text, at most 1,000 JavaScript string code units. Encode with `stringToBytes`, decode with `hexToString`. |
| `imageUrl` | `bytes()` | Required HTTPS URL without embedded credentials, at most 2,048 JavaScript string code units. Same UTF-8 encoding as description. |
| `currency` | `str().default('INR')` | Three-letter currency code, normalized to uppercase; writes require two-decimal minor units, such as INR/USD. Display only; no custody. |
| `createdAt` | `u64()` | Seller-supplied Unix **milliseconds**, supplied as `u64(Date.now())`. Display metadata, not proof of publication time. |

Descriptions and image URLs use `bytes()` because normal descriptions and URLs can exceed Arkiv's 128-byte `str` limit. Each `bytes` value can hold up to 128 KiB, sharing a 128 KiB entity budget in SDK 1.0.1; these application limits stay well within that budget. They are unindexed attributes, not a separate JSON payload.

The SDK reads each attribute as a typed wrapper: for example, `row.title.value`, `row.priceMinor.value`, and `hexToString(row.description.value)`. System fields such as `$key`, `$owner`, and `$expiresAt` are direct values.

The application accepts non-negative prices (including free listings), rounds to the nearest minor unit, and rejects amounts whose minor-unit integer exceeds JavaScript's safe integer range. Storage is `uint64`. Price formatting preserves fractions and uses bigint arithmetic to avoid losing large integer digits.

## Repository contract

```ts
interface ListingRepository {
  create(input: CreateListingInput, walletClient: ListingWalletClient): Promise<string>;
  getById(id: string): Promise<Listing | null>;
  search(filters?: ListingFilters): Promise<Listing[]>;
}
```

`create` returns the entity key after the SDK confirms the write. Pass an Arkiv wallet client from `createWalletClient`, configured with the connected account and Rabdi chain; a plain Wagmi/Viem wallet client does not expose `createEntity`. For an injected browser wallet, use its provider via Viem's `custom(provider)` transport. No private key is required in frontend code.

`getById` returns `null` for missing, deleted, or expired entities and incompatible seller/status metadata. Invalid IDs, transport failures, and schema mismatches propagate as errors rather than being hidden as missing listings. Searches skip schema mismatches (SDK default), invalid lifecycle states, and seller/owner mismatches.

## Expiration and lifecycle

Creates explicitly default to:

```ts
{ expiration: ExpirationTime.fromDays(7) }
```

An explicit lifetime must be positive and fit SDK/protocol bounds. The SDK resolves durations to block lifetimes. **`$expiresAt` is a bigint block height, not a Unix timestamp**; the domain exposes it as `expiresAtBlock`. Converting it to a date requires chain block timing and is an estimate. The SDK's system `$createdAt` and `$updatedAt` are also block heights, distinct from the application `createdAt` attribute.

Expired entities disappear from active queries. Reservation and sale are explicit seller status changes, not expiration. Reserved/sold entities remain queryable until expiration or deletion; seller history uses `status: 'all'`. The protocol restricts mutations to the owner by default. Future lifecycle methods can use SDK `patchEntity`, `extendEntity`, and `deleteEntity`; they are outside issue #5's create/read/search interface. An extension requests a later deadline or minimum lifetime from the current block, not an unconditional addition to the old deadline.

## Queries and pagination

```ts
import { addr } from '@arkiv-network/sdk';
import { asc, eq } from '@arkiv-network/sdk/query';
import { listingSchema } from '@/lib/arkiv/schema';

const activeListings = await publicClient
  .select()
  .from(listingSchema)
  .where(eq('status', 'available'))
  .orderBy(asc('$key'))
  .limit(20)
  .offset(0)
  .fetch();

// No status filter: includes available, reserved, and sold entities.
const sellerListings = await publicClient
  .select()
  .from(listingSchema)
  .where(eq('seller', addr(sellerAddress)))
  .ownedBy(sellerAddress)
  .orderBy(asc('$key'))
  .limit(20)
  .fetch();
```

`search()` defaults to `status: 'available'`, a page size of 20, offset 0, and ascending entity-key order. Set `status: 'all'` to omit the status filter. Category, city, seller, and status filters combine with AND. The SDK validates limits (1–100) and non-negative safe-integer offsets, including explicitly supplied zero values.

One search returns one page, not the whole catalog. Offsets count matching entities even when the SDK or repository drops incompatible rows, so pages can contain fewer listings than requested. A stable key sort keeps pages ordered while data stays unchanged; concurrent writes/expiry can still shift offset pages.

## Privacy and references

Arkiv entities and their unindexed content are public. FreshMarket's structured fields contain only coarse location and public listing details. Free-text fields cannot guarantee absence of private information; sellers must not enter street addresses, phone numbers, credentials, or private contact details.

- [Official Arkiv documentation](https://docs.arkiv.network/)
- [Arkiv TypeScript SDK source](https://github.com/Arkiv-Network/arkiv-sdk-js) (implementation checked against installed SDK 1.0.1)

## Public media references (Phase 8)

`imageUrl` remains UTF-8 bytes. It accepts either a credential-free HTTPS URL or `bzz://` followed by a public unencrypted 64-hex Swarm reference. Readers resolve that reference through their own network-matched gateway. The value stored on Arkiv is the immutable reference, not the local blob URL, upload credential or postage signing key. Swarm files and Arkiv metadata are public. Encrypted key-bearing references are intentionally rejected.
