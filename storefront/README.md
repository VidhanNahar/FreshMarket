# SECOND LOOK — Storefront B

A standalone static TypeScript app with an independent Arkiv SDK public reader. It displays the public `freshmarket.listings.v2` contract from Rabdi, including full entity keys, seller addresses, exact USDT prices, categories, conditions, statuses and expiry blocks. Unlisted listings are hidden here too. The theme and rendering are separate from FreshMarket.

From the repository root:

```bash
npm ci
npm run build:storefront
```

The deployable artifact is `public/storefront/`. Upload its contents to a static host; no Next.js backend, wallet provider, FreshMarket API, or browser storage is required. The source depends on the Arkiv SDK, Viem, Vite, and the pure public media rules in `shared/media.ts`; it imports no files from FreshMarket's `src/`. This repository uses the root lockfile for reproducible dependencies.

For a reader access key, set `VITE_ARKIV_ACCESS_KEY` in the root `.env.local` or build environment. It is embedded in the public bundle and must be origin restricted to the independent host. Leaving it empty uses the heavily rate-limited public endpoint. Rebuild to change the key.

`npm run dev` and `npm run build` build these assets automatically. Locally, `/storefront` redirects to the generated `/storefront/index.html`, which is served as a static file outside FreshMarket's React/wallet layout. Polling runs every 15 seconds while visible; the refresh button always performs independent RPC reads. Successful refresh replaces prior results; failed refresh retains and explicitly labels stale data.

Use [the judge script](../arkiv/portability-demo.md) for a live two-client demonstration. Test fixtures demonstrate behavior but are not real transaction evidence.

Public-catalogue scans are bounded to 10,000 node matches (including schema-skipped records) and a 60-second budget checked between bounded RPC requests. An oversized catalogue produces a visible error rather than a silently partial success. Production growth requires server-query filtering and user-visible pagination.
