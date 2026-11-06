# Phase 10: FreshPay USDT checkout on Whitechain

FreshPay lets a buyer pay a FreshMarket seller in USDT on **Whitechain Sepolia (chain ID 1874)**. The Arkiv listing decides what is for sale and at what price; the FreshPay contract holds the payment, records the order and settles it. A merchant outside FreshMarket can embed the same checkout in about 20 lines.

## Why this flow needs onchain stablecoin settlement on Whitechain

A FreshMarket listing has no operator who could take a card payment on the seller's behalf: the catalogue is owned by seller wallets on Arkiv, and any storefront can sell from it. FreshPay settles USDT straight from buyer to seller wallet with no FreshMarket merchant account, and the contract enforces things a card rail or a plain transfer cannot: one paid order per listing (atomic stock of one across every storefront), escrow until the buyer confirms receipt, refunds that go back to the payer's address, and a public order ID that a buyer's Arkiv review cites as proof of purchase.

## What is in the repository

| Piece | Where | Notes |
| --- | --- | --- |
| Contract | [`contracts/src/FreshPay.sol`](../contracts/src/FreshPay.sol) | Foundry, Solidity 0.8.28, OpenZeppelin `SafeERC20` + `ReentrancyGuard` |
| Contract tests | [`contracts/test/`](../contracts/test/) | 21 unit/fuzz tests and a fork test against the official USDT |
| Reusable SDK + widget | [`src/freshpay/`](../src/freshpay/) | Imports only `react`, `viem`, `wagmi`. `FreshPayCheckout`, `useFreshPayCheckout`, `verifyPayment`, readers, webhook signing |
| 20-line integration | [`src/app/checkout-demo/page.tsx`](../src/app/checkout-demo/page.tsx) | A fictional merchant ("Chai Studio") that imports nothing from FreshMarket |
| Buyer checkout | `/checkout/[listingId]` | Price, seller and status come from the Arkiv entity |
| Customer receipt | `/receipt/[orderId]` | Read from contract state; history from the Whitechain explorer |
| Merchant dashboard | `/merchant/payments` | Sales, refunds (full or partial), payout claims, purchases |
| Webhooks | `/api/freshpay/webhooks/dispatch`, [`src/lib/freshpay/webhook-*.ts`](../src/lib/freshpay/) | HMAC-SHA256 signed, idempotent, retried with backoff |

## Order lifecycle

```
             pay(merchant, ref, amount, deadline)
  (none) ─────────────────────────────────────────▶ Paid ── funds held by FreshPay
                                                     │
            refund(id, part)  ◀── merchant ──────────┤ (from escrow; Paid stays Paid)
            refund(id, rest)  ──▶ Refunded           │ (ref freed: item can be sold again)
                                                     │
            release(id): buyer any time, anyone after releaseAfter
                                                     ▼
                                                  Released ── funds sent to merchant
                                                     │
            refund(id, amount) ◀── merchant ─────────┘ (pulled from merchant wallet after approve)
            full refund ──▶ Refunded
```

- **Order IDs** are sequential `uint64` values starting at 1, the `orderId` that `freshmarket.reviews` stores. A review counts once the order is `Released` or `Refunded` (see [`review-repository.ts`](../src/services/review-repository.ts)).
- **One live order per (merchant, reference).** FreshMarket uses the Arkiv entity key as the reference, so a second buyer's payment reverts with `ReferenceAlreadyPaid` until the first order is fully refunded. Other merchants pass their own order or invoice ID; the SDK hashes strings to `bytes32`.
- **Hold period: 10 minutes on the demo deployment.** `releaseDelay` is fixed in the constructor. The deploy script defaults to 600 seconds so a demo can show the seller claiming a payout; set `FRESHPAY_RELEASE_DELAY` (seconds) higher for real goods, where buyers need days to receive an item.
- **Quote deadline.** `pay` reverts after `deadline` (the widget uses 15 minutes), so a checkout page left open cannot settle a price the seller has since changed.
- **Exact transfers.** The contract checks the balance it actually received, so a fee-on-transfer token cannot underfund escrow. Approvals are for the exact amount, never unlimited.
- **No admin.** There is no owner, pause or fee. Nobody but the buyer, merchant and the release timer can move an order's funds.

## Why payments never touch Arkiv listings

Arkiv entities can only be changed by their owner's wallet. FreshPay runs on a different chain, holds no seller keys and never writes to Arkiv. After a payment:

1. The order exists on Whitechain; the Arkiv listing is unchanged and still says `available`.
2. FreshPay's one-order-per-listing rule already stops a second payment, and `/checkout` checks it before showing the widget.
3. The seller sees the order on **My Listings** and **Payments**, and marks the listing `reserved` or `sold` with their own Rabdi wallet. They can still extend or delete it.
4. If the seller refunds in full, the reference is freed. The listing can be sold again without republishing.

This keeps the seller in control of their catalogue (the Arkiv ownership model) while money moves only through a contract that enforces stock and refunds. A payment provider holding seller keys to auto-mark items sold would break that ownership model.

## Payment verification

The app never trusts a transaction hash from the browser. `verifyPayment` requires a successful receipt on chain 1874, an `OrderPaid` log emitted by the configured contract, and a stored order whose merchant, reference and amount match the listing. Receipts and dashboards read `getOrder` / `getOrders` directly. The Whitechain explorer API supplies only transaction history.

## Webhooks

`GET /api/freshpay/webhooks/dispatch` (Bearer `CRON_SECRET`) runs one dispatch:

1. It takes a short lock, so only one dispatcher runs at a time.
2. It scans confirmed `OrderPaid` / `OrderReleased` / `OrderRefunded` logs after the stored cursor, 10 blocks behind head, in 5,000-block windows. Whitechain's RPC rejects spans above 10,000.
3. It enqueues each event under a stable ID, `chainId:txHash:logIndex`, then advances the cursor.
4. It POSTs due events with `freshpay-signature: t=<unix>,v1=<HMAC-SHA256("t.body")>` and an `idempotency-key` header. Non-2xx responses or errors retry after 30 s, 1 min, 2 min, and so on, capped at 1 hour, for up to 8 attempts.

A crash anywhere leads to redelivery, never loss. Receivers deduplicate by event ID; [`demo-receiver`](../src/app/api/freshpay/webhooks/demo-receiver/route.ts) shows a verified receiver that creates each order once. `npm run freshpay:webhooks` calls the dispatcher every 15 s for local demos. Production needs `FRESHPAY_STATE_URL`/`TOKEN` (Redis-compatible REST); process memory is used only in development.

## Deploy and verify

You need Foundry, a throwaway wallet with test WBT from the [faucet](https://faucet.testnet.whitechain.io), and the official test USDT for the payment itself.

```bash
git submodule update --init --recursive          # forge-std, OpenZeppelin
npm run contracts:test                           # 21 tests
WHITECHAIN_SEPOLIA_RPC_URL=https://rpc.testnet.whitechain.io \
  forge test --root contracts --match-contract Fork   # real USDT on a fork

export WHITECHAIN_SEPOLIA_RPC_URL=https://rpc.testnet.whitechain.io
export WHITECHAIN_DEPLOYER_PRIVATE_KEY=0x...     # test wallet only; never commit
npm run contracts:deploy                         # deploys and verifies on Blockscout
```

The script refuses any chain but 1874 and prints the contract address and deploy block. Put them in `.env.local` as `NEXT_PUBLIC_FRESHPAY_ADDRESS` and `NEXT_PUBLIC_FRESHPAY_DEPLOY_BLOCK`, then restart `npm run dev`. If verification does not finish during deploy, run it again:

```bash
forge verify-contract <address> src/FreshPay.sol:FreshPay --root contracts \
  --rpc-url $WHITECHAIN_SEPOLIA_RPC_URL --verifier blockscout \
  --verifier-url https://explorer.testnet.whitechain.io/api/ \
  --constructor-args $(cast abi-encode "constructor(address,uint64)" 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 600)
```

To run the end-to-end flow on a local fork (no keys, no testnet funds): start `anvil --fork-url https://rpc.testnet.whitechain.io --port 8547`, then run `FRESHPAY_FORK_RPC=http://127.0.0.1:8547 npx vitest run src/__tests__/freshpay-fork-live.test.ts`.

## Live evidence

Only real, confirmed transactions belong here. The contract is deployed and verified; the payment, refund and release are still **outstanding**. The deploy record is [`contracts/broadcast/DeployFreshPay.s.sol/1874/run-latest.json`](../contracts/broadcast/DeployFreshPay.s.sol/1874/run-latest.json).

| Item | Value |
| --- | --- |
| FreshPay contract (verified) | [`0x2D67Ed6aA929B1Dbc28370AEe3e23AD56277657F`](https://explorer.testnet.whitechain.io/address/0x2D67Ed6aA929B1Dbc28370AEe3e23AD56277657F) · 10-minute hold (`releaseDelay = 600`) · official test USDT |
| Deployment transaction | [`0x2b440f05…22f2`](https://explorer.testnet.whitechain.io/tx/0x2b440f05c829f5929dcc8e50444d52e0082c207ec5218dcf6f65d730e84522f2), block 12407705 |
| Test payment in official USDT (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`) | _pending_ |
| Partial refund | _pending_ |
| Buyer release | _pending_ |

## Limitations

- **The price is not signed by the seller.** The contract cannot read Arkiv, so the checkout page passes the Arkiv price to `pay`. A buyer who calls the contract directly can pay a different amount and lock the listing. The merchant dashboard flags amounts that differ from the listing price, and a full refund frees the listing. Seller-signed EIP-712 quotes would close this gap.
- **No arbiter.** Disputes come down to the seller refunding or the hold timer releasing funds. The `Disputed` state in `review-repository.ts` is unused by this contract.
- **A 10-minute hold protects buyers only briefly.** It suits the demo, not shipped goods: an unconfirmed order can be released to the seller 10 minutes after payment. Production needs a redeploy with a longer delay.
- **Not gasless.** The buyer pays WBT gas for approve and pay. The Scale track's sponsored flow is out of scope.
- Webhook state needs a Redis-compatible store in production, and the dispatcher must be run by a scheduler. Vercel Hobby crons run only daily, so use the worker script or an external cron.
- Order lists read every ID for a wallet in one call, which is fine on testnet but would need pagination at scale.
