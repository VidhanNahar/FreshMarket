# Two-storefront judge walkthrough

## Setup

1. Install with `npm ci`. Set an origin-restricted `NEXT_PUBLIC_ARKIV_ACCESS_KEY` for FreshMarket and optionally `VITE_ARKIV_ACCESS_KEY` for Storefront B. Both are public RPC access keys, not wallet secrets.
2. Run `npm run dev`. It builds Storefront B's static assets before starting Next.js.
3. Open `/sell` as seller A with test tGLM on Rabdi. Open `/storefront` in a separate browser profile or incognito window, without a wallet.
4. For a separately hosted reader, run `npm run build:storefront` and upload the contents of `public/storefront/` to any static host. `index.html` uses relative asset URLs. Restrict its access key to that host and rebuild after changing it. No FreshMarket server or API is required.

## Recording script

1. Publish a laptop in FreshMarket with a normal seven-day lifetime. Show the actual transaction hash and entity key after confirmation. If public verification is delayed, use the read-only verification retry; do not publish a duplicate.
2. Refresh SECOND LOOK (Storefront B). Show the same full entity key, seller address and price. This is a direct Arkiv read with no FreshMarket login or wallet provider. If the indexer is still catching up, wait for the next 15-second refresh or retry manually.
3. In `/my-listings`, edit the price. Approve the real wallet transaction and retain its hash. Refresh Storefront B until the changed price appears for the same entity key.
4. Mark the listing reserved. FreshMarket's available-only browse catalogue removes it, while Storefront B's default all-live-status view displays `reserved`. Change B's status selector to demonstrate this explicitly.
5. Mark it sold. Show that the record remains in B as `sold` and that the expiration block did not change. Sale status does not delete or expire a listing.

## Fifteen-minute expiration demo

1. On `/sell`, click **Load 15-minute expiry demo**. This fills a disposable test laptop preset and selects the 15-minute lifetime. Review it, then approve publishing. The preset button does not send a transaction.
2. Record the confirmed entity key, current block and expiry block. The SDK encodes 15 minutes as 450 blocks at Rabdi's two-second target. The receipt's expiry block is authoritative; observed wall time may differ.
3. Show its countdown and amber warning. The seller dashboard offers **Renew listing** while less than 24 hours remain. Do not renew the item used for the expiry demonstration.
4. Keep `/browse` open. It polls confirmed block height every five seconds. Once the block reaches the entity's expiration, the cached card is pruned even without a catalogue refetch. Local timer estimates alone never remove a record.
5. Refresh B after the deadline: its independent public query and block check exclude the same key. No cron job or central delete operation was used. A network outage can delay either UI; failed refreshes are labelled and never presented as successful empty results.

## Verification commands

```bash
npm test
TEST_ARKIV_DISCOVERY=1 npm test -- src/__tests__/listing-discovery-live.test.ts
npm run build
```

The production script explicitly uses Webpack and runs `prebuild` to package Storefront B first.

## Evidence log

| Evidence | Status |
| --- | --- |
| Fixture rehearsal: matching keys, price/status changes and expiry | Passed automated test in `storefront-portability.test.ts` |
| Live independent public reads (2026-11-06) | Both readers succeeded; zero live records returned, so populated live sync is not yet demonstrated |
| Independent static hosting smoke check | Separate local HTTP server served the reader successfully (200) |
| Real laptop publish transaction / entity key | Pending connected-wallet demo |
| Separate-host reader URL and matching real entity key | Pending deployment/demo |
| Real edit/reserved/sold transaction hashes | Pending connected-wallet demo |
| Short-lived entity key and observed expiration block | Pending connected-wallet expiry demo |
| Final recording / screenshots | Pending live rehearsal |

Do not close the live demo acceptance solely because an empty public catalogue query passes. Replace pending evidence with genuine receipts and observed results after running the script.
