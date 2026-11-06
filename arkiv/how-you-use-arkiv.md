# FreshMarket Arkiv lifecycle

Listings use the `freshmarket.listings` schema on Rabdi (7794095). Public readers do not require a wallet. The connected wallet provider signs creates and lifecycle operations; private keys never enter the application.

## Seller lifecycle: issues #11–#13

`ArkivListingRepository` exposes `updateListing`, `updateStatus`, `extendExpiry`, and `deleteListing`, each taking an SDK wallet client and returning the confirmed entity key and transaction hash. Extension receipts also return the expiration block. Before a mutation, the repository rereads the record and requires the connected account to equal both the indexed seller and actual Arkiv owner. The signer must be on Rabdi. The provider account and chain are checked again immediately before broadcast, covering account/network switches while reads and estimation are in progress.

- Price and description use the SDK's schema-typed `patchEntity`. Prices remain uint64 minor units; text is UTF-8 bytes. Edit inputs parse decimal strings directly to bigint, preserving exact prices.
- Status is a single-column patch. Available, reserved and sold are reversible seller choices. **Sold does not delete, shorten, or extend the entity.**
- `extendEntity` sets a deadline rather than adding a duration. FreshMarket adds the requested 7/14/30 days (43,200 blocks per day) to the latest stored expiration and passes `ExpirationTime.atBlock`. The SDK receipt contains the actual resulting block.
- Delete calls `deleteEntity` only after an explicit permanent-delete confirmation. The entity disappears from live public queries after confirmation/indexing.
- `/my-listings` queries all live pages with both indexed seller and `$owner`, with `status: 'all'`. Tabs separate available, reserved and sold. Expired/deleted records are not historical archives on Arkiv.

The SDK and expiry behavior follow the [official change/delete guide](https://docs.arkiv.network/writing/change/) and [expiration guide](https://docs.arkiv.network/writing/expiration/).

## Transaction and cache behavior

The dashboard allows one operation at a time, pauses its inventory refetch while pending, and provides wallet-confirmation, pending, public-verification, confirmed and error states with a transaction link. Status/detail/delete changes optimistically update affected caches. Rejected requests roll back only the affected record, preserving other records updated concurrently. Extension uses the receipt's actual deadline.

No wallet mutation is automatically retried. Confirmation invalidates the common listing namespace, including buyer catalogue, seller inventory and detail data. Public verification alone retries with bounded backoff to tolerate indexing lag. An indexing timeout retains the confirmed receipt and offers refresh instead of another signature.

If a hash was submitted but confirmation fails, the dashboard blocks further mutations and offers **Check transaction status**, a read-only receipt check. A reverted receipt restores the previous record; a successful receipt refreshes queries. Keep the transaction link before leaving/reloading the page: action locks and pending state are currently in memory, not persistent across navigation or reload.

## Automated verification

`npm test` covers:

- Owner checks before all four operations, missing/expired records, wrong chain and invalid edits.
- Wallet B rejected before patch, status, extension or deletion requests.
- Real SDK patch serialization before signing; sold makes no extension/deletion call.
- Exact prices, extension relative to the existing deadline and all-status seller queries.
- Wallet account/network changes before broadcast, duplicate-click guards, rejected-signature rollback, unknown-outcome receipt checks and indexing lag.
- Dashboard connection/network states, ownership filtering, tabs, edit/extension forms and delete confirmation/cancellation.

These tests use fixtures and transport mocks. They are **not evidence that live Rabdi owner enforcement or actual wallet transactions have been demonstrated**.

## Live two-wallet authorization verification

1. Wallet A publishes a disposable test listing on Rabdi. Record the real entity key and transaction hash.
2. Wallet A reserves the item, marks it sold and restores it to available. Check the public record after each transaction; verify its key and expiration do not change on status updates.
3. Edit its price/description and extend it by +7 days. Confirm the resulting expiration increased by 302,400 blocks from the pre-extension deadline.
4. Connect wallet B. Wallet A's items must not appear in B's dashboard. A direct application repository update/delete using B must reject before any signature request.
5. To verify protocol enforcement separately from the application guard, run read-only direct-SDK simulations against A's still-live entity:

```bash
ARKIV_SECURITY_ENTITY_KEY=0x... ARKIV_SECURITY_OTHER_WALLET=0x... npm test -- src/__tests__/listing-security-live.test.ts
```

The second address is public, not a private key, and must differ from the owner. The test allowlists read/estimate RPC methods and blocks signing and broadcast. It must receive an explicit NotOwner/owned-by rejection for patch and delete. Rate-limit, connectivity and insufficient-funds errors do not pass as authorization evidence.

6. Back on wallet A, cancel a delete once and verify no transaction was sent. Then confirm deletion of the disposable listing and check that it no longer appears in public queries.

| Required live evidence | Status |
| --- | --- |
| Wallet A entity key / creation transaction | Pending a funded browser-wallet test |
| Available → Reserved → Sold transactions | Pending |
| Price/description edit and extension transactions | Pending |
| Wallet B direct SDK patch/delete NotOwner results | Pending; opt-in simulation requires A's live entity |
| Wallet A deletion transaction / public absence | Pending |

No live transaction hash, entity key, or network-rejection result is fabricated. Keep #11 and #13 live acceptance open until this evidence is recorded.

## Reproducible reads and Swarm references

Run `npm run query:listings` with an optional `NEXT_PUBLIC_ARKIV_ACCESS_KEY` in the shell environment to query the schema directly without FreshMarket's server. The exact executable query is in `scripts/query-listings.mjs`. It uses `.from(schema)`, `eq('status', 'available')`, ascending `$key` order and a 20-record limit. Bigint values are printed as decimal strings.

`createWithReceipt(input, connectedArkivWallet)` writes schema-typed attributes and a selected lifetime; SDK `createEntity` returns the entity key, transaction hash and exact expiration block. `getById(key)` performs public read-back. `updateStatus(key, 'sold', wallet)` patches only status. `extendExpiry(key, 7, wallet)` adds 302,400 blocks to the freshly read deadline. `deleteListing(key, wallet)` explicitly removes the entity. None of these examples is a fabricated transaction receipt.

Phase 8 uses the same public `imageUrl` field for `bzz://` references, while file bytes are uploaded to Swarm separately. See `swarm.md` for exact source files, upload/read commands and missing live evidence. A failed Swarm upload never automatically creates an Arkiv entity.
