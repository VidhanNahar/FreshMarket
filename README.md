# FreshMarket

**Publish once. Sell locally. Let stale listings expire.**

FreshMarket is a second-hand marketplace where each listing is an [Arkiv](https://arkiv.network) entity owned by the seller's wallet. Sellers choose how long a listing lives, and mark it available, reserved or sold. Buyers browse without a wallet. When a listing's deadline passes, it disappears from every app that reads it, with no cleanup job.

Listings aren't locked into our app. **SECOND LOOK**, a separate static storefront with its own Arkiv client and no FreshMarket code, shows the same entities. Sold is a status, not deletion or expiry.

Built from scratch at ETHGlobal Mumbai 2026.

## Live demo

| | |
| --- | --- |
| App | https://fresh-market-tawny.vercel.app |
| Browse (no wallet) | [`/browse`](https://fresh-market-tawny.vercel.app/browse) |
| Second storefront (SECOND LOOK) | [`/storefront`](https://fresh-market-tawny.vercel.app/storefront) |
| Live listing | [`/listing/0x888bc02c…6887`](https://fresh-market-tawny.vercel.app/listing/0x888bc02cb0f37fc6f6a13c6566f233cd850aae58a00ba73777c4055839156887) (MacBook Air M1, with a verified buyer review of this seller) |
| A paid order | [`/receipt/1`](https://fresh-market-tawny.vercel.app/receipt/1) |
| Reusable USDT checkout widget | [`/checkout-demo`](https://fresh-market-tawny.vercel.app/checkout-demo) |

It runs on three testnets: Arkiv Rabdi (listings, reviews), Ethereum Sepolia (ENSv2 seller names) and Whitechain Sepolia (USDT checkout).

## Wallets that wrote our data

| Network | Wallet | What it wrote |
| --- | --- | --- |
| Arkiv Rabdi (7794095) | `0x8A9a8Ed316F939b5d19Ee6cAa7f0fB56D88E2A30`, `0x10fE549c8d1d3d4272c8d88aa6b9ffFD23E7aeEB`, `0xC431629995Cc77d29e1629eaFC57222033fBa196` | 16 listings (`freshmarket.listings.v2`) and their edits, status changes, renewal and delete |
| Arkiv Rabdi | `0x6b446F7c62C8892a9E830Fd4D6dAf9943b2609C1` | 4 buyer reviews (`freshmarket.reviews`) |
| Arkiv Rabdi | `0x8221b829d2a7Aa718e7e72D4690f112D4cb39fC8` | First test listings, including Iphone-16 [`0x02efe70e…6437`](https://rabdi.explorer.arkiv.network/entity/0x02efe70e7f31a9a8d966a880f4ecdf13066bd91880dbe11a32799e6ff5b46437) |
| Ethereum Sepolia | `0x2D63097b7d955d487F06523f05676611146CA905` | `freshmarket.eth`, its subname registry, `alice.freshmarket.eth`, records and delegation ([ENS_QUALIFICATION.md](ENS_QUALIFICATION.md)) |
| Whitechain Sepolia | `0x6b446f7c62c8892a9e830fd4d6daf9943b2609c1` | FreshPay contract [`0x2D67…657F`](https://explorer.testnet.whitechain.io/address/0x2D67Ed6aA929B1Dbc28370AEe3e23AD56277657F) (verified) and 4 USDT orders as the buyer ([whitechain/README.md](whitechain/README.md#live-evidence)) |

## One query you can run

No wallet and no FreshMarket server needed:

```bash
git clone https://github.com/VidhanNahar/FreshMarket.git && cd FreshMarket && npm ci
npm run query:listings                      # available, public listings
CATEGORY=electronics npm run query:listings # one category branch
```

The source is [`scripts/query-listings.mjs`](scripts/query-listings.mjs):

```ts
const result = await client.select().from(schema)
  .where(eq('status', 'available')).where(eq('visibility', 'public'))
  .orderBy(asc('$key')).limit(20).fetch();
```

More queries (category, brand, city, price range, a seller's store) are in [arkiv/schema.md](arkiv/schema.md#queries).

## Sponsor checklist

| Track | Requirement | Status |
| --- | --- | --- |
| Arkiv: Build on Arkiv | Writes to Rabdi with `@arkiv-network/sdk`. Browse, detail, SECOND LOOK and reviews read from it | ✅ |
| | Writer wallet and a runnable query in this README | ✅ |
| | [schema](arkiv/schema.md), [friction](arkiv/friction.md), [reach](arkiv/reach.md), [why Arkiv](arkiv/why-arkiv.md), [how we use Arkiv](arkiv/how-you-use-arkiv.md) | ✅ |
| | Another wallet can't edit a seller's listing (live check) | ✅ [TEST_REPORT.md](TEST_REPORT.md) |
| Arkiv + Swarm bonus | Images stored on Swarm, `bzz://` reference in a live listing | ⏳ code done, no live upload yet ([arkiv/swarm.md](arkiv/swarm.md)) |
| ENS: Best Use of ENSv2 | Own subname registry, per-seller Permissioned Resolver, delegation and revocation on Sepolia | ✅ [ENS_QUALIFICATION.md](ENS_QUALIFICATION.md) |
| Whitechain: Operate | Verified contract, reusable widget, merchant and customer views | ✅ `/checkout-demo`, `/merchant/payments`, `/receipt/[id]` |
| | A live USDT payment with an explorer link | ✅ order #1 [`0x60b575e3…8f83`](https://explorer.testnet.whitechain.io/tx/0x60b575e3f99c97f5a580fc2eabb7a83215cad33e3e42126f0a8c04e3f18e8f83), plus partial refund and release |
| All | 2–4 minute demo video | ⏳ |

## How it works

```
Seller wallet ──create / patch / extend / delete──▶ Arkiv Rabdi ◀──public reads── FreshMarket, SECOND LOOK, any app
Buyer wallet ──pay USDT──▶ FreshPay (Whitechain) ──order ID──▶ Buyer writes a review entity on Arkiv
Seller name ◀── ENS (Sepolia): alice.freshmarket.eth, shown only if it resolves to the listing's $owner
```

| Page | What it does |
| --- | --- |
| `/browse` | Search by category, brand/model, city, price, condition and delivery. Wallet-free |
| `/sell` | Publish a listing with a 15-minute (demo), 3, 7, 14 or 30-day lifetime |
| `/my-listings` | Edit, reserve, mark sold, renew or delete your listings |
| `/listing/[key]` | Listing detail, seller name, verified reviews and **Buy now with USDT** |
| `/storefront` | SECOND LOOK, the independent reader |
| `/identity`, `/storefront/settings` | ENS seller name and delegated record editing |
| `/checkout/[key]`, `/receipt/[orderId]`, `/merchant/payments` | FreshPay checkout, receipt and review form, seller orders |

## Documentation

| File | Contents |
| --- | --- |
| [arkiv/schema.md](arkiv/schema.md) | Entities, indexed fields, owners, expiry, queries |
| [arkiv/how-you-use-arkiv.md](arkiv/how-you-use-arkiv.md) | Each Arkiv feature and what the user sees, plus live evidence |
| [arkiv/why-arkiv.md](arkiv/why-arkiv.md) | What users would lose with Postgres, and what we kept off Arkiv |
| [arkiv/reach.md](arkiv/reach.md) | Who it's for, how to try it, plans after Mumbai |
| [arkiv/friction.md](arkiv/friction.md) | Arkiv feedback with reproduction steps |
| [arkiv/portability-demo.md](arkiv/portability-demo.md) | Two-storefront walkthrough and demo script |
| [arkiv/swarm.md](arkiv/swarm.md) | Swarm image integration |
| [ENS_QUALIFICATION.md](ENS_QUALIFICATION.md), [ens/README.md](ens/README.md) | ENSv2 identity, transactions, setup guide |
| [whitechain/README.md](whitechain/README.md), [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md) | FreshPay architecture, deployment, feedback |
| [storefront/README.md](storefront/README.md) | Building and hosting SECOND LOOK |
| [TEST_REPORT.md](TEST_REPORT.md) | Test results, including live network checks |
| [SECURITY.md](SECURITY.md) | Audit, fixes and remaining risks |

## Run locally

Node.js 22.14+ and npm.

```bash
npm ci
cp .env.example .env.local   # add your Arkiv access key and WalletConnect project ID
npm run dev                  # http://localhost:3000
```

Never commit a private key or seed phrase. Restrict public Arkiv access keys to your origin in [Arkiv Hub](https://hub.arkiv.network/access-keys). Get Rabdi test tGLM from the [faucet](https://hub.arkiv.network/faucet).

```bash
npm run lint
npm test                 # unit and component tests
npm run build            # also builds SECOND LOOK into public/storefront/
npm run contracts:test   # FreshPay Foundry suite
npm run start -- --port 3001 && npm run smoke -- http://localhost:3001
```

Production builds use Next.js Webpack. Development uses Turbopack.

### Deploying

Use the repository root as the Vercel project. `npm run build` runs `prebuild`, which generates SECOND LOOK first. Set `NEXT_PUBLIC_ARKIV_ACCESS_KEY`, `VITE_ARKIV_ACCESS_KEY` and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (origin-restricted). Add the FreshPay, ENS and optional Swarm values from [`.env.example`](.env.example). Public variables are baked into the bundle, so redeploy after changing them. Keep server-only Swarm credentials out of `NEXT_PUBLIC_` and `VITE_` variables.

## Architecture

| Layer | Implementation |
| --- | --- |
| App | Next.js 16, React 19, TypeScript, Tailwind, Base UI |
| Wallet | Wagmi and RainbowKit. The wallet signs; no private key in the frontend |
| Listing data | Arkiv SDK 1.0.1 on Rabdi (chain 7794095) |
| Cache | TanStack Query with shared invalidation and bounded read retries. Wallet writes are never retried automatically |
| Independent reader | SECOND LOOK: static Vite app with its own SDK client and schema |
| Images | Swarm (`bzz://`) or HTTPS references stored in the listing's `media` attribute |
| Identity | ENSv2 on Sepolia |
| Payments | FreshPay contract on Whitechain Sepolia (chain 1874), official test USDT, reusable widget in `src/freshpay/` |
| Tests | Vitest and Testing Library with the real SDK serializer; Foundry for the contract |

## ENSv2 seller identity

Sellers get a name like `alice.freshmarket.eth` under the project's own subname registry, each with their own Permissioned Resolver. A seller can let a shop manager edit one text record, then revoke that right. Listings show the name only if it resolves to the listing's seller, and fall back to the address if ENS is down. Details and transactions: [ENS_QUALIFICATION.md](ENS_QUALIFICATION.md). Setup guide: [ens/README.md](ens/README.md).

## FreshPay: USDT checkout on Whitechain

**Why onchain stablecoin settlement on Whitechain:** FreshMarket's catalogue belongs to seller wallets on Arkiv, so there is no marketplace operator to hold a card merchant account or a payout balance for sellers. USDT settles buyer to seller wallet directly, and the FreshPay contract enforces what a regular payment rail cannot: one paid order per listing across every storefront that reads it, escrow until the buyer confirms receipt, refunds that go back to the payer's own address, and a public order ID that an Arkiv review cites as proof of purchase.

Buyers pay for an Arkiv listing in the official test USDT on Whitechain Sepolia. FreshPay holds the payment until the buyer confirms receipt (or 10 minutes pass), allows one paid order per listing, lets the seller refund part or all of it, and issues the `orderId` that a `freshmarket.reviews` entity cites as proof of purchase. Payment never edits the Arkiv listing. The seller marks it sold with their own wallet.

```
Buyer wallet ──approve(exact amount)──▶ USDT 0xcedf…55a7
     └──pay(seller, Arkiv listing key, price, deadline)──▶ FreshPay 0x2D67…657F (Whitechain Sepolia)
             ├─ holds USDT · one live order per listing · emits OrderPaid
             ├─ buyer confirms receipt, or 10 min passes ──▶ USDT to seller (OrderReleased)
             ├─ seller refunds part or all ──▶ USDT to buyer (OrderRefunded)
             └─ events ──▶ signed webhooks · receipts · order ID cited by Arkiv reviews
```

`/checkout-demo` embeds the widget in 21 lines that import only `@/freshpay` ([source](src/app/checkout-demo/page.tsx)). Connect a wallet with WBT ([faucet](https://faucet.testnet.whitechain.io)) and test USDT, then click **Pay with USDT**. More in [whitechain/README.md](whitechain/README.md).

## Demo script (3 minutes, two wallets)

Seller `seller1.freshmarket.eth`, buyer `buyer1.freshmarket.eth`.

1. **0:00–0:20 Problem.** Stale second-hand listings, re-posted on every site, and no proof a reviewer actually bought anything.
2. **0:20–0:55 Arkiv.** The seller publishes a listing with a chosen lifetime and shows its entity key. SECOND LOOK, a separate app, shows the same entity. Browse filters by category, city and price with indexed queries, without a wallet.
3. **0:55–1:25 ENSv2.** The listing shows `seller1.freshmarket.eth`, resolved live. On Storefront Settings, the seller lets a manager edit one text record, then revokes it.
4. **1:25–2:20 Whitechain.** The buyer clicks **Buy now with USDT**: the widget switches network, approves the exact amount, and pays into FreshPay. The seller sees the sale on Payments, issues a partial refund, and marks the listing reserved, then sold, on Arkiv. The buyer confirms receipt and the seller is paid.
5. **2:20–2:50 Reviews.** The buyer reviews the seller from the receipt. The review is an Arkiv entity citing the FreshPay order, and the listing page shows it as a verified purchase.
6. **2:50–3:00 Expiry.** A 15-minute listing has passed its expiry block and is gone from every app. Sold items stay until their owner removes them.

Full Arkiv walkthrough: [arkiv/portability-demo.md](arkiv/portability-demo.md).

## Limitations

- Testnet only. Every write needs a wallet signature and test gas.
- Public reads can trail a confirmed write. The app keeps the transaction hash and retries the read.
- Expiry is a block height. Countdowns are estimates from Rabdi's 2-second blocks.
- Everything on Arkiv is public. Don't put addresses or phone numbers in listings.
- Pending-transaction locks live in memory. Keep the transaction link if you reload mid-write.
- Order webhooks are implemented and tested (`TEST_REPORT.md`) but not running on the live deployment, which has no Redis state store configured. Run them locally with `npm run freshpay:webhooks`.
- Not audited for production. See [SECURITY.md](SECURITY.md).

## How we used AI

- **OpenAI Codex:** implementation, review, debugging, tests and documentation for the Arkiv marketplace, SECOND LOOK, Swarm and ENS phases.
- **Antigravity CLI / Gemini:** planning and writing GitHub issues.
- **Claude Code (Claude Opus 5.5):** the FreshPay contract and tests, checkout SDK and widget, checkout pages, webhooks, reviews, and documentation, including this README and the `arkiv/` judging files.

Commits prepared with Claude Code carry a `Co-Authored-By` trailer. The team chose the product and scope and signed every live transaction from its own wallets. Every result claimed in this repository comes from a command you can rerun or a transaction you can look up.

## Team and license

Vidhan Nahar and Dhairya. MIT License, see [LICENSE](LICENSE).
