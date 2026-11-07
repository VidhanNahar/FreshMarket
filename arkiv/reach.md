# Reach

## Who it's for

- **Local second-hand sellers.** People selling a phone, a laptop or a dog crate in their own city. Today they post the same item on three or four sites, and the old posts stay up long after the item is gone. On FreshMarket they publish once, the listing expires on its own, and they mark it reserved or sold with their wallet.
- **Buyers.** They browse, search by category, brand, city and price, and see only listings that are still live. No wallet is needed to browse.
- **Other storefronts.** Anyone can show the same listings without asking us for an API key or a data export. SECOND LOOK, our second reader, is the proof: a separate static app with its own Arkiv client and no FreshMarket code.

## Would they use it?

A seller would, because it removes stale listings and repeated data entry. A buyer would, because "is this still available?" is the most common question on second-hand sites, and here an expired listing is simply gone. The cost today is a wallet and testnet gas for each write. That's acceptable for a demo but not for mainstream users yet (see "After Mumbai").

## Try it today

| What | Where |
| --- | --- |
| Live app (browse without a wallet) | https://fresh-market-tawny.vercel.app/browse |
| Sell a listing (Rabdi wallet with tGLM from the [faucet](https://hub.arkiv.network/faucet)) | https://fresh-market-tawny.vercel.app/sell |
| Second, independent storefront | https://fresh-market-tawny.vercel.app/storefront |
| Pay for a listing in USDT (Whitechain Sepolia) | `/listing/<key>` → **Buy now with USDT** |
| Query the data with no app at all | `npm run query:listings` |

## Numbers so far

| Metric | Value | How to check |
| --- | --- | --- |
| Live listings | 16 across 6 categories and 3 cities (Mumbai, Pune, Bengaluru) | `npm run query:listings` |
| Wallets that wrote to Arkiv | 5 (4 sellers, 1 buyer) | [how-you-use-arkiv.md](how-you-use-arkiv.md#live-evidence-on-rabdi) |
| Real USDT orders on Whitechain | 4, all released, one partly refunded | `/receipt/1` to `/receipt/4` on the live app |
| Buyer reviews on Arkiv | 4, each tied to a FreshPay order | Any listing page from those sellers |
| Apps reading the same entities | 2 (FreshMarket and SECOND LOOK) | Open the same key in `/listing/<key>` and `/storefront` |
| Networks in one flow | 3: Arkiv (listings, reviews), Sepolia ENS (seller names), Whitechain (USDT checkout) | [TEST_REPORT.md](../TEST_REPORT.md) |
| Automated tests | 363 passing, plus live checks on Rabdi, Sepolia and Whitechain | [TEST_REPORT.md](../TEST_REPORT.md) |

We don't have real users yet. Every listing, order and review above was created by the team's own test wallets during the event.

## After Mumbai

We plan to keep building FreshMarket. In order:

1. **Pilot in one city.** Onboard a handful of real sellers in Mumbai or Ahmedabad and collect feedback on the publish → reserve → sold → expire loop.
2. **Remove the gas step for sellers.** Sponsored or batched writes, so a seller signs once instead of paying per listing.
3. **Open the schema to other storefronts.** Publish `freshmarket.listings.v2` as a standalone spec with the reader rules, so a community group or local shop can run its own storefront over the same listings.
4. **Real images on Swarm**, with a postage batch, so photos are as portable as the listing.
5. **Mainnet** once Arkiv and Whitechain are available there.

Source: https://github.com/VidhanNahar/FreshMarket (MIT).
