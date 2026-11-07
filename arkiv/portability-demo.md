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
| Fixture rehearsal: matching keys, price/status changes and expiry | Passes (`storefront-portability.test.ts`) |
| Real publish | Done: 17 live listings from 4 wallets. Example: [`0x888bc02c…6887`](https://rabdi.explorer.arkiv.network/entity/0x888bc02cb0f37fc6f6a13c6566f233cd850aae58a00ba73777c4055839156887) (MacBook Air M1) |
| Both readers show the same live key | Done: https://fresh-market-tawny.vercel.app/listing/0x888bc02cb0f37fc6f6a13c6566f233cd850aae58a00ba73777c4055839156887 and `/storefront` |
| Real price edit, reserve, sold and renew | Done on the ThinkPad [`0x083dacf1…3d7f`](https://rabdi.explorer.arkiv.network/entity/0x083dacf10fb6869c85d12685194687833265a850d51964d984378c3206be3d7f). Transactions are in [how-you-use-arkiv.md](how-you-use-arkiv.md#live-evidence-on-rabdi) |
| Real delete | Done: [`0xdafec1fe…0823`](https://rabdi.explorer.arkiv.network/tx/0xdafec1fe8737bddb4b7184296cf51db7ac1a418ab3072aacc646b19b19d70823) |
| 15-minute listing expiring | Done: created in [`0x7f93aa81…a14a`](https://rabdi.explorer.arkiv.network/tx/0x7f93aa811a427f4d8f5297ca517a436d92980a7dd4e12dc7d9347a27e4c7a14a), absent from queries after block 314,356 |
| Side-by-side recording | For the demo video |
