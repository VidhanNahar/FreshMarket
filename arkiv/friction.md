# Arkiv feedback

What got in our way while building FreshMarket on Rabdi with `@arkiv-network/sdk` 1.0.1, and what we wish existed. Each item says what we expected, what happened, how to reproduce it, and what would fix it.

## Things that broke or surprised us

### 1. `extendEntity` replaces the deadline instead of adding to it

- **Expected:** "Renew for 7 days" on a listing with 5 days left gives 12 days.
- **Happened:** `extendEntity({ expiration: ExpirationTime.fromDays(7) })` sets the deadline to 7 days from now, so the listing gets 7 days instead of 12. The docs mention this, but the method name says "extend".
- **Reproduce:** Create an entity with `fromDays(14)`, then call `extendEntity` with `fromDays(7)` and compare `$expiresAt` before and after.
- **Our workaround:** Read the current `$expiresAt`, then pass `ExpirationTime.atBlock(current + days * 43_200)` ([`listing-repository.ts`](../src/services/listing-repository.ts), tested in `listing-lifecycle.test.ts`).
- **Fix:** An `ExpirationTime.addDays(n)` helper, or an `extendBy` option that adds to the current deadline.

### 2. A short page doesn't mean you've reached the end

- **Expected:** If `fetch()` returns fewer rows than `limit`, there are no more pages.
- **Happened:** The SDK drops rows that don't decode against the schema and only counts them in `page.skipped`. A page full of rows from another writer using the same schema tag comes back with 0 entities even though valid listings follow. Our first reader stopped there and hid real listings.
- **Reproduce:** Write a few entities with the `freshmarket.listings.v2` tag but a missing `priceMinor`, then a valid listing. Query with `.limit(n)` and stop on `entities.length < n`.
- **Our workaround:** Page coverage is `entities.length + skipped` ([`storefront/src/reader.ts`](../storefront/src/reader.ts), lines 40 and 49).
- **Fix:** A `hasMore` / `nextCursor` field on the result, so callers don't have to rebuild it from `skipped`.

### 3. Anyone can write into our schema

- **Expected:** `defineSchema('freshmarket.listings.v2', …)` would claim that name for us.
- **Happened:** The schema is just an indexed `arkiv.schema` tag. Any wallet can write entities with the same tag and those rows show up in `.from(schema)` queries.
- **Reproduce:** From any funded wallet, create an entity whose `arkiv.schema` is `freshmarket.listings.v2` and `seller` is someone else's address. It appears in `npm run query:listings`.
- **Our workaround:** Every reader drops a listing unless the indexed `seller` equals `$owner` ([schema.md, Reader rules](schema.md#reader-rules)).
- **Fix:** Optional owner-scoped schemas (only listed writers' rows match), or a built-in `.where(eq('seller', '$owner'))`-style self-reference.

### 4. Querying "everything except sold" takes a workaround

- **Expected:** `neq('status', 'sold')` or `not(...)`.
- **Happened:** `@arkiv-network/sdk/query` exports `eq`, `gt`, `gte`, `lt`, `lte`, `startsWith`, `and` and `or`. There's no negation and no `in`.
- **Reproduce:** `import { neq } from '@arkiv-network/sdk/query'` fails.
- **Our workaround:** `or(eq('status', 'available'), eq('status', 'reserved'))`. That's fine for three values but awkward for open-ended ones.
- **Fix:** `neq` and `inArray`.

### 5. No substring or text search

- **Expected:** Some way to match "laptop" inside a title.
- **Happened:** Only indexed equality, ranges and `startsWith` exist. Unindexed fields can't be filtered at all.
- **Our workaround:** We turned search into indexed keys. A category tree resolves `dogtoy` to `startsWith('categoryPath', 'pets/dogs/toys')`. Brand and model are normalized keys. Leftover words are matched on the client over the narrowed results ([schema.md, Which index answers which search](schema.md#which-index-answers-which-search)).
- **Fix:** A `contains` operator on indexed strings, or a documented pattern for running an off-chain search index over Arkiv.

### 6. A wrong-owner write fails as a gas-estimation string

- **Expected:** A typed `NotOwnerError` the app can catch.
- **Happened:** Arkiv does refuse a patch or delete from another wallet (good), but the failure arrives as a gas-estimation revert. We match it with a regex: `/NotOwner|owned by.*not /i`.
- **Reproduce:** `ARKIV_SECURITY_ENTITY_KEY=0x083dacf10fb6869c85d12685194687833265a850d51964d984378c3206be3d7f npx vitest run src/__tests__/listing-security-live.test.ts` (read-only; nothing is signed).
- **Fix:** Export typed errors for `NotOwner`, `Expired` and `NotFound`.

### 7. Expiry is a block height, not a time

- **Expected:** A timestamp we can show as "expires in 3 days".
- **Happened:** `$expiresAt`, `$createdAt` and `$updatedAt` are block heights. Every UI has to hard-code Rabdi's 2-second block target to show a countdown.
- **Fix:** An SDK helper such as `estimateTime(block)`, or the block target exposed on the chain object.

### 8. Expired entities leave nothing behind to read

- **Expected:** The explorer would still show an old listing's last state.
- **Happened:** Our first listing (entity `0xaaa46e15…6c7e`, created in tx [`0xd81bfe31…a8fa`](https://rabdi.explorer.arkiv.network/tx/0xd81bfe31c3e8d16ae0ef2f2aeed24dc1fe50d78f0503c2740dbaca78ce92a8fa)) is gone. The transaction is still there, but the entity page and queries return nothing. That's the right behaviour for a live catalogue, but it makes receipts and disputes harder to support.
- **Fix:** A historical read (`getEntity(key, { atBlock })`) or an indexer endpoint for expired entities.

### 9. Read-after-write lag has no SDK helper

- **Expected:** A confirmed create shows up immediately in `getEntity`.
- **Happened:** Public reads can trail the receipt, so "publish, then open the listing" sometimes 404s for a moment.
- **Our workaround:** Keep the confirmed key and transaction hash, retry the read with bounded backoff, and show a "waiting for the indexer" state without asking for another signature.
- **Fix:** `waitForEntity(key, { timeout, signal })` in the SDK.

### 10. Public-endpoint warning and the two chain configs

- **Happened:** `rabdi({ accessKey: '' })` logs a rate-limit warning. The read key is origin-restricted and public, so it shouldn't travel inside the chain config handed to browser wallets. So we build two: an origin-restricted key for reads and a key-free chain for the wallet.
- **Reproduce:** Run `npm run dev` without `NEXT_PUBLIC_ARKIV_ACCESS_KEY`.
- **Fix:** A React/Wagmi example that sets up both roles and explains origin restriction in Arkiv Hub.

## Smaller notes

- **Byte limits:** `str` values are capped at 128 UTF-8 bytes, not characters, so a Hindi or emoji title fails earlier than the character count suggests. We validate bytes separately and store long text as `bytes`. A non-ASCII example in the docs would help.
- **182-day maximum lifetime:** Reviews have to be re-signed every six months to stay visible. The SDK's `InvalidExpiryError` explains this well. We map it to "Arkiv keeps an entity for at most about 182 days" in the UI.
- **Wallet history:** We could only list our writer's transactions through the explorer's `/api/transactions?address=<wallet>` endpoint, which we found by reading network requests. A documented endpoint would make submission evidence easier.

## What we'd like next

1. `extendBy` / `addDays` for renewals (item 1).
2. A `hasMore` / cursor on query results (item 2).
3. Owner-scoped schemas (item 3).
4. `neq`, `inArray` and `contains` (items 4–5).
5. Typed errors (item 6) and a block-to-time helper (item 7).
6. Historical reads for expired entities (item 8).
