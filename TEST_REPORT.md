# Test report: Arkiv, ENSv2 and Whitechain

Run on 2026-11-07 against `main` at `35e8d62` plus the Phase 11 changes in the same commit as this file.

## Results

| Suite | Command | Network | Result |
| --- | --- | --- | --- |
| Unit and component tests | `npm test` | Mocked transports | **363 passed**, 13 opt-in live tests skipped |
| Lint, type check, production build | `npm run lint`, `npx tsc --noEmit`, `npm run build` | — | Pass |
| FreshPay contract | `npm run contracts:test` | Local EVM | **21 passed** (unit and fuzz) |
| FreshPay against the official USDT | `forge test --root contracts --match-contract Fork` | Whitechain Sepolia fork | **1 passed** |
| FreshPay end to end (pay, block a second buyer, reject a spoofed hash, refund, release, history, webhooks) | `FRESHPAY_FORK_RPC=… npx vitest run src/__tests__/freshpay-fork-live.test.ts` | Whitechain Sepolia fork | **1 passed** |
| Arkiv: another wallet cannot patch or delete a real listing | `ARKIV_SECURITY_ENTITY_KEY=0x02ef…6437 npx vitest run src/__tests__/listing-security-live.test.ts` | **Live Rabdi** | **2 passed** (`NotOwner` at gas estimation; nothing broadcast) |
| Arkiv public discovery | `TEST_ARKIV_DISCOVERY=1 npx vitest run src/__tests__/listing-discovery-live.test.ts` | **Live Rabdi** | **2 passed** |
| Arkiv chain and client | `npx vitest run src/__tests__/arkiv-chain.test.ts` | **Live Rabdi** | **5 passed** |
| ENSv2 key-scoped delegation on the real resolver (grant → edit → stranger refused → out-of-scope refused → revoke → refused) | `ENS_LIVE_TESTS=1 npx vitest run src/__tests__/ens-delegation-live.test.ts` | **Live Sepolia** (`eth_simulateV1`) | **3 passed** |
| ENSv2 delegation state of `alice.freshmarket.eth` | `npm run verify:ens-delegation` | **Live Sepolia** | Owner can edit, revoked manager cannot |

## Three-network integration (`src/__tests__/three-network-integration.test.tsx`)

| Check | Result |
| --- | --- |
| ENS resolution fails → the listing, its price, the raw seller address and the Buy button still render | Pass |
| ENS resolves → the name appears beside unchanged Arkiv data | Pass |
| Whitechain-backed review checks fail → the listing and Buy button remain; only the reviews block shows an error | Pass |
| Wallet switches Rabdi → Sepolia → Whitechain → listing content is unchanged | Pass |
| FreshPay not configured → checkout is blocked, browsing is unaffected | Pass |
| Each page requires its own chain (Arkiv pages Rabdi, ENS pages Sepolia, payment pages Whitechain) | Pass |
| The wrong-network warning appears only on pages that write to Arkiv, never on ENS or payment pages | Pass |
| The navbar badge names the network the current page needs | Pass |

Each chain uses its own read client (`getArkivPublicClient`, `ensPublicClient`, `whitechainPublicClient`). None reads Wagmi's active chain, so a wallet network switch or one RPC outage cannot change another chain's reads.

## Live run on real testnets

`LIVE_DEMO_BUYER_KEY=… npx vitest run src/__tests__/live-demo-flow.test.ts` ran the whole flow on Rabdi and Whitechain Sepolia on 2026-11-07: create, edit, pay 1 USDT, reserve, partial refund, release, sold, renew, review, a 15-minute listing that expired, and a create-then-delete. Every transaction is listed in [arkiv/how-you-use-arkiv.md](arkiv/how-you-use-arkiv.md#live-evidence-on-rabdi) and [whitechain/README.md](whitechain/README.md#live-evidence).

## Not covered

- **Browser and wallet UI.** Real MetaMask prompts, mobile layouts and Lighthouse scores were not automated.
