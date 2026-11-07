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

On 2026-11-07, 16 listings and 4 reviews are live. They were written by these wallets:

| Wallet | Role | What it wrote |
| --- | --- | --- |
| `0x8A9a8Ed316F939b5d19Ee6cAa7f0fB56D88E2A30` | Seller (Mumbai) | 6 listings, plus the full lifecycle below |
| `0x10fE549c8d1d3d4272c8d88aa6b9ffFD23E7aeEB` | Seller (Pune) | 5 listings |
| `0xC431629995Cc77d29e1629eaFC57222033fBa196` | Seller (Bengaluru) | 5 listings |
| `0x6b446F7c62C8892a9E830Fd4D6dAf9943b2609C1` | Buyer | 4 reviews, each backed by a FreshPay order |
| `0x8221b829d2a7Aa718e7e72D4690f112D4cb39fC8` | Seller (first tests) | 9 transactions on 2026-11-06 and a delete on 2026-11-07 |

One listing, the Lenovo ThinkPad T14 [`0x083dacf1…3d7f`](https://rabdi.explorer.arkiv.network/entity/0x083dacf10fb6869c85d12685194687833265a850d51964d984378c3206be3d7f), went through every operation:

| Step | Transaction |
| --- | --- |
| Create | [`0x10f73566…042d`](https://rabdi.explorer.arkiv.network/tx/0x10f735661269ab9621b8e590b52104e1bcf9fc10c7dd2ebe08727635eef4042d) |
| Edit price | [`0xf14bca0c…82fd`](https://rabdi.explorer.arkiv.network/tx/0xf14bca0cdf41cec4eefb146029feea14609c462ced61add68d4f7c770d0382fd) |
| Buyer pays 1 USDT on Whitechain (order #1) | [`0x60b575e3…8f83`](https://explorer.testnet.whitechain.io/tx/0x60b575e3f99c97f5a580fc2eabb7a83215cad33e3e42126f0a8c04e3f18e8f83) |
| Seller marks it reserved | [`0xfce04de6…30d2`](https://rabdi.explorer.arkiv.network/tx/0xfce04de60079dcb75415a779176c147d196bdff00f9833332391acc8fe6930d2) |
| Seller marks it sold (the deadline doesn't change) | [`0xaa243976…1b49`](https://rabdi.explorer.arkiv.network/tx/0xaa243976eee5246c7a73116ddf32410f325977870cef96bd7ee15dca6b7e1b49) |
| Seller renews it (`$expiresAt` 616,298 → 918,698) | [`0x4cd16ae8…7816`](https://rabdi.explorer.arkiv.network/tx/0x4cd16ae8a3642fbcd1f142f16ac73b0afe71376298104170a34d01162a3a7816) |
| Buyer writes a review citing order #1 | [`0x913be9f3…a24e`](https://rabdi.explorer.arkiv.network/tx/0x913be9f34532a1ab9383f01969cf1e78fcf0ac824ab95758b1a377b306b4a24e) |

| Also shown live | Evidence |
| --- | --- |
| A 15-minute listing expires on its own | Created in [`0x7f93aa81…a14a`](https://rabdi.explorer.arkiv.network/tx/0x7f93aa811a427f4d8f5297ca517a436d92980a7dd4e12dc7d9347a27e4c7a14a) with `$expiresAt` 314,356. After that block it is gone from every query, with no delete call |
| Delete | Created in [`0x6c7dec89…cdf7`](https://rabdi.explorer.arkiv.network/tx/0x6c7dec89802930560c5ab7420f937386d3fa231a14e42e9e15147a2c1ca6cdf7), deleted in [`0xdafec1fe…0823`](https://rabdi.explorer.arkiv.network/tx/0xdafec1fe8737bddb4b7184296cf51db7ac1a418ab3072aacc646b19b19d70823) |
| Another wallet can't edit a listing | `ARKIV_SECURITY_ENTITY_KEY=0x083dacf10fb6869c85d12685194687833265a850d51964d984378c3206be3d7f npx vitest run src/__tests__/listing-security-live.test.ts`: patch and delete fail with `NotOwner` at gas estimation, and nothing is broadcast |
| Query it yourself | `npm run query:listings` |

## Reliability details

- Before any write, the repository rereads the listing and checks that the connected wallet is both the indexed `seller` and the actual `$owner`, and that the wallet is on Rabdi. It checks again just before broadcast in case the user switched account or network.
- Wallet writes are never retried automatically. After confirmation, only the public read is retried, with backoff, to cover indexer lag. If the read times out, the user keeps the transaction link and can refresh without signing again.
- If a hash was submitted but confirmation failed, the dashboard blocks further edits and offers **Check transaction status**, a read-only receipt check.
- Readers page with `entities.length + skipped` so rows from other writers can't end pagination early, and stop at 10,000 matches or 60 seconds with a visible error.

`npm test` covers these paths with the real SDK serializer and mocked transports. The live checks above cover them on Rabdi.
