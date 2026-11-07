# Submission evidence and release status

This file records missing evidence explicitly rather than inventing a deployed URL, wallet, entity or successful demonstration.

| Item | Current state |
| --- | --- |
| Public application URL | https://fresh-market-tawny.vercel.app (Storefront B at `/storefront`) |
| Real Rabdi writer wallet | `0x8221b829d2a7Aa718e7e72D4690f112D4cb39fC8` |
| Real portable entity key | [`0x02efe70e7f31a9a8d966a880f4ecdf13066bd91880dbe11a32799e6ff5b46437`](https://rabdi.explorer.arkiv.network/entity/0x02efe70e7f31a9a8d966a880f4ecdf13066bd91880dbe11a32799e6ff5b46437) ("Iphone-16", available, `$owner` = seller) |
| Wallet-free read checks | `npm run query:listings` returns the live listing (2026-11-07) |
| Cross-wallet rejection | Live: another wallet's patch and delete of that entity fail with `NotOwner` at gas estimation, nothing broadcast (`listing-security-live.test.ts`, see [TEST_REPORT.md](../TEST_REPORT.md)) |
| Real status/edit/extension/delete transaction hashes | Not yet recorded |
| Two storefront sync | Automated fixture rehearsal passes. Both storefronts read the same live entity key; a recorded side-by-side run is still needed |
| 15-minute expiry demo | Preset and 450-block encoding tested; live expiration observation not recorded |
| Swarm upload + reference + postage provenance | Requires Bee endpoint, usable batch and enabled test wallet |
| Browser/Lighthouse results | Browser automation host unavailable; no Lighthouse score claimed |
| Post-event maintenance promise | Team confirmation needed |

## Acceptance gate

Before closing #19–#23 or submitting a sponsor qualification claim, replace the missing items with real public URLs, actual writer wallet addresses, transaction/explorer links, entity keys, Swarm reference/batch provenance and a recorded live run. Confirm allowed origins on Arkiv Hub and the Swarm upload service. An empty read or a successful build does not prove the write or deployment flows.

## Required source documentation

`schema.md`, `friction.md`, `reach.md`, `how-you-use-arkiv.md`, and `why-arkiv.md` exist. `swarm.md` documents the optional media integration. They state implemented behavior separately from live evidence. Requirements were checked against the [official Arkiv/Swarm prize page](https://ethglobal.com/events/mumbai/prizes); eligibility and award decisions remain with the organizers.

## Verified local release checks (2026-11-06)

- `npm test`: 201 passed, 6 opt-in live checks skipped.
- `npm run lint`: passed after fixing a test-mock lint error.
- `npm run build`: passed with explicit Next.js Webpack, including Storefront B's Vite build and TypeScript validation. Existing MetaMask SDK optional React Native storage warnings remain; no build errors.
- `npm run smoke -- http://localhost:3001`: production server returned 200 for six checked routes; standalone JavaScript asset and 307 storefront redirect passed.
- `npm run query:listings`: reached real Rabdi and returned an empty array.
- Axe structural navigation checks passed. The DOM environment does not verify color contrast or geometry; no Lighthouse/browser viewport score is claimed.
- Swarm upload/auth/media tests use fixtures and mocked Bee responses. No postage batch was purchased, no live file uploaded and no real Swarm-backed Arkiv write is inferred from them.

These results are local observations, not Vercel deployment evidence.
