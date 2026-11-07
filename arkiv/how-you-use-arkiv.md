# How FreshMarket uses Arkiv

Two entity types on Rabdi (chain `7794095`). Full field list: [schema.md](schema.md).

| Entity | Owner (can edit) | Expires | Why that fits |
| --- | --- | --- | --- |
| `freshmarket.listings.v2` | Seller | The seller picks: 15 minutes (demo), 3, 7, 14 or 30 days. Default 7, renewable | A second-hand item is sold within days or weeks. An old listing should disappear rather than mislead buyers |
| `freshmarket.reviews` | Buyer | 180 days | Reputation as a trailing six-month window. The buyer, not the seller or us, owns the review |

## Every Arkiv feature we use, and what the user sees

| Arkiv feature | Where in the code | What the user sees |
| --- | --- | --- |
| `createEntity` with schema-typed attributes | `createWithReceipt` in [`listing-repository.ts`](../src/services/listing-repository.ts) | `/sell` → **Publish** shows the entity key, transaction link and expiry block |
| Indexed `eq` / `startsWith` / `gte` / `lte` / `or` | `search` / `searchAll` in the repository | `/browse` filters: category tree, brand/model search, city, price range, condition, pickup/ship. Typing `dogtoy` runs one indexed `startsWith('categoryPath', 'pets/dogs/toys')` query |
| `status` as an indexed attribute plus `patchEntity` | `updateStatus` | **Reserve** / **Mark sold** in `/my-listings`. The listing leaves `/browse` (available only) but stays visible in SECOND LOOK with its new status |
| `patchEntity` on price and description | `updateListing` | **Edit** in `/my-listings`. The new price appears in both storefronts under the same key |
| `$expiresAt` | Every reader | A countdown on each card, an amber warning near the deadline, and the card dropping out of `/browse` when the block passes |
| `extendEntity` with `ExpirationTime.atBlock` | `extendExpiry` | **Renew +7 / +14 / +30 days** in `/my-listings`. The new deadline comes from the receipt |
| `deleteEntity` | `deleteListing` | **Delete** (with confirmation) removes the listing from every app |
| `$owner` and `.ownedBy()` | Every reader, plus `/my-listings` | A seller's dashboard shows only their own listings. A listing whose `seller` doesn't match `$owner` is never shown, so no one can fake a listing in someone else's name |
| `getEntity(key)` | `getById` | Direct links: `/listing/0x…` and SECOND LOOK's key view |
| Second, independent public client | [`storefront/src/reader.ts`](../storefront/src/reader.ts) | SECOND LOOK at `/storefront`: a different app showing the same entity key, price and status |
| Reviews filtered by `eq('seller', …)` | Review reader | Star ratings and reviews on each listing page, counted only when the FreshPay order proves the reviewer bought from that seller |

## Do filters, owners and expiry fit the app?

- **Filters:** We index exactly what buyers filter on: `status`, `visibility`, `categoryPath`, `brand`, `model`, `condition`, `city`, `fulfilment`, `priceMinor` and `seller`. Title, description and media aren't indexed because no query filters on them. Price is a `u64` in USDT minor units so range filters are exact and match the FreshPay checkout price.
- **Who can edit:** Only the seller wallet can change or delete a listing. Payment doesn't change it: FreshPay never writes to Arkiv, and the seller marks the item sold. Reviews are owned by the buyer, so a seller can't delete a bad review.
- **Expiry:** Sold isn't the same as expired. A sold listing stays readable until its deadline, so a buyer can still open the link from their receipt. An unsold listing vanishes at its deadline unless the seller renews it.

## Live evidence on Rabdi

| What | Link or command |
| --- | --- |
| Writer wallet | `0x8221b829d2a7Aa718e7e72D4690f112D4cb39fC8`: 9 transactions (8 creates, 1 patch) on 2026-11-06 |
| Live listing | [`0x02efe70e…6437`](https://rabdi.explorer.arkiv.network/entity/0x02efe70e7f31a9a8d966a880f4ecdf13066bd91880dbe11a32799e6ff5b46437) ("Iphone-16", created in [`0x994880ef…fa4b`](https://rabdi.explorer.arkiv.network/tx/0x994880efeeedd63bf2671854ee093fb81fb6d25466c77a140ff6fa5fb486fa4b)) |
| A patch | [`0xda5be436…827f`](https://rabdi.explorer.arkiv.network/tx/0xda5be436ad82c04a5347af15792f01c93df9ba0e4bad301ef191849368c3827f) (entity `0x155b56be…72e7`) |
| Expiry working | The first listing, created in [`0xd81bfe31…a8fa`](https://rabdi.explorer.arkiv.network/tx/0xd81bfe31c3e8d16ae0ef2f2aeed24dc1fe50d78f0503c2740dbaca78ce92a8fa), has expired and no longer appears in any query |
| Another wallet can't edit it | `ARKIV_SECURITY_ENTITY_KEY=0x02efe70e7f31a9a8d966a880f4ecdf13066bd91880dbe11a32799e6ff5b46437 npx vitest run src/__tests__/listing-security-live.test.ts`: patch and delete fail with `NotOwner` at gas estimation, and nothing is broadcast |
| Query it yourself | `npm run query:listings` |

## Reliability details

- Before any write, the repository rereads the listing and checks that the connected wallet is both the indexed `seller` and the actual `$owner`, and that the wallet is on Rabdi. It checks again just before broadcast in case the user switched account or network.
- Wallet writes are never retried automatically. After confirmation, only the public read is retried, with backoff, to cover indexer lag. If the read times out, the user keeps the transaction link and can refresh without signing again.
- If a hash was submitted but confirmation failed, the dashboard blocks further edits and offers **Check transaction status**, a read-only receipt check.
- Readers page with `entities.length + skipped` so rows from other writers can't end pagination early, and stop at 10,000 matches or 60 seconds with a visible error.

`npm test` covers these paths with the real SDK serializer and mocked transports. The live checks above cover them on Rabdi.
