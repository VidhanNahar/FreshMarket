# FreshMarket

**Publish once. Sell locally. Let stale listings expire.**

FreshMarket is a wallet-owned second-hand marketplace prototype on Arkiv Rabdi. Sellers publish public, time-limited listings and independently control available, reserved and sold status. Buyers browse without connecting a wallet. SECOND LOOK is an independently buildable reader for the same public entities, showing that the catalog belongs to the seller's data contract rather than a private marketplace database.

The demo story is a laptop listing: publish once in FreshMarket, read the same entity key in SECOND LOOK, change its price/status, and let a short-lived test listing expire without a central deletion cron. **Sold is a status, not deletion, expiry, payment or an atomic reservation.**

## Current verification and live status

This is a testnet prototype. Automated tests cover SDK encoding, ownership checks, cache rollback, indexing lag, expiry, two-reader portability, media references and upload validation. Live public RPC reads succeeded but returned an empty catalogue at the latest verification. A successful empty query is not evidence of a real write or populated storefront sync.

No verified public deployment URL, real writer wallet, real transaction receipt, or live Swarm upload has been recorded. These are outstanding release requirements, not fabricated examples. The exact [evidence log](arkiv/submission-evidence.md), [deployment checklist](arkiv/deployment.md), and [Swarm requirements](arkiv/swarm.md) distinguish code completion from live acceptance.

## Run locally

Use Node.js 22.14+ (or a current supported Node release) and npm.

```bash
git clone https://github.com/VidhanNahar/FreshMarket.git
cd FreshMarket
npm ci
cp .env.example .env.local
npm run dev
```

Replace example values in `.env.local` with real Arkiv access and WalletConnect project IDs. Keep the server-only Swarm configuration empty unless you have a Bee node, valid postage batch and intended upload wallets. Never enter or commit a wallet private key or seed phrase. Origin-restrict public read keys in Arkiv Hub.

Open http://localhost:3000. `/browse` is wallet free; `/sell` and `/my-listings` use the connected Rabdi wallet. `/storefront` redirects to SECOND LOOK's static artifact. Dev/build scripts generate that artifact automatically.

```bash
npm run lint
npm test
npm run build
npm run start -- --port 3001
npm run smoke -- http://localhost:3001
```

Production builds explicitly use Next.js Webpack for reproducibility in this environment; development remains on Turbopack.

## Reproduce the public Arkiv query

No FreshMarket server or wallet is required:

```bash
npm run query:listings
# With a domain-appropriate access key set in the shell, when applicable:
NEXT_PUBLIC_ARKIV_ACCESS_KEY=your_real_key npm run query:listings
```

The exact executable source is [scripts/query-listings.mjs](scripts/query-listings.mjs). It defines `freshmarket.listings`, queries available entities with `eq('status', 'available')`, sorts by `$key`, and returns 20 rows. It uses the official SDK's public client and prints bigint amounts/block heights as decimal strings. For direct SDK usage:

```ts
const result = await publicClient.select().from(listingSchema)
  .where(eq('status', 'available')).orderBy(asc('$key')).limit(20).fetch();
```

The complete schema, imports and ownership caveats are in [arkiv/schema.md](arkiv/schema.md). Seller inventory also filters indexed seller and actual `$owner`; other writers can copy a public schema tag.

## Architecture

| Layer | Implementation |
| --- | --- |
| Main application | Next.js 16, React 19, TypeScript, Tailwind, accessible Base UI dialogs |
| Wallet | Wagmi, RainbowKit, connected-provider signing; no frontend private key |
| Public data | Arkiv SDK 1.0.1 contract on Rabdi, chain 7794095; Viem transport |
| Cache | TanStack Query, shared invalidation, bounded read retries, no automatic wallet-write retry |
| Independent reader | Static Vite app with its own public SDK client, schema and dark theme |
| Optional images | Authorized Bee HTTP upload, public bzz reference in Arkiv `imageUrl`, gateway rendering |
| Tests | Vitest, Testing Library, real SDK serialization with isolated transport fixtures |

Swarm file bytes remain separate from Arkiv listing metadata. No FreshMarket Solidity contract or payment mechanism is deployed for this core flow. Rabdi uses test tGLM. Expiry is a block height; countdown time is estimated from the two-second target. The buyer view prunes on confirmed block updates; sold records stay onchain until expiry or explicit deletion.

`npm run build:storefront` generates `public/storefront/` for independent static hosting. SECOND LOOK imports no FreshMarket API/provider/repository and uses no application local storage. Its public media resolution rules live in `shared/media.ts`. See [its README](storefront/README.md).

## Reproducible demo and limitations

Use [the full judge walkthrough](arkiv/portability-demo.md). The seller form offers a reviewable **15-minute expiry demo** preset (450 blocks); publishing still requires wallet approval. Keep actual transaction links before leaving a pending page: transaction locks are currently in memory. Cross-wallet rejection and live expiry observation remain required acceptance evidence.

The two-minute script: **0:00–0:20** explain stale listings and repeated catalog entry; **0:20–0:50** publish a laptop and show its actual receipt/key; **0:50–1:15** open SECOND LOOK and compare key/seller; **1:15–1:40** edit price and reserve/sell, refresh the second reader; **1:40–2:00** show the pre-recorded short-lived entity at its confirmed expiration and explain that sold does not delete it. Disclose any sped-up expiry footage and indexing waits; do not imply instant propagation.

RPC rate limits, indexing lag and gateway availability can delay reads. Arkiv is public: do not include private contact details in listings. Public upload is restricted to enabled wallets, and postage lifetime limits Swarm persistence. Read [why Arkiv](arkiv/why-arkiv.md), [friction](arkiv/friction.md), [reach](arkiv/reach.md), [usage](arkiv/how-you-use-arkiv.md), and [Swarm integration](arkiv/swarm.md).

## AI assistance and human verification

OpenAI Codex assisted implementation, review, debugging, tests, documentation and branch/commit preparation during this development session. The user also supplied a transcript showing Antigravity CLI / Gemini used for issue planning and creation. No Claude contribution or specific human test result is asserted without evidence.

Automated commands and fixture tests are separate from manual verification. Browser automation was unavailable in this session, so mobile/Lighthouse results, real wallet signing, postage acquisition, populated cross-storefront sync and production smoke acceptance are not claimed complete. Team members must personally verify the final deployed demo, confirm their AI-use disclosure and comply with [ETHGlobal's current rules and sponsor requirements](https://ethglobal.com/events/mumbai/prizes) before submission.

## Team and license

Vidhan Nahar and Dhairya. Source: [VidhanNahar/FreshMarket](https://github.com/VidhanNahar/FreshMarket). Open source under the [MIT License](LICENSE).

## Security review status

The project-wide hardening pass fixed replayable uploads, unauthenticated body buffering, skipped-row pagination, stale upload completion, incomplete-publication reset and undefined optimistic edits. See [the audit and open release risks](arkiv/security-audit.md) and [SECURITY.md](SECURITY.md). Production Swarm uploads require shared atomic replay/quota state; an in-process cache is never used as a production fallback. Unresolved dependency advisories and live wallet/deployment checks mean the prototype is not yet cleared for unrestricted production use.
