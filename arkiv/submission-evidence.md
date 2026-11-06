# Submission evidence and release status

This file records missing evidence explicitly rather than inventing a deployed URL, wallet, entity or successful demonstration.

| Item | Current state |
| --- | --- |
| Public application URL | No verified deployment recorded |
| Real Rabdi writer wallet | Not supplied/verified; unit-test fixture addresses are not writers |
| Real creation/status/edit/extension/delete transaction hashes | No live wallet receipts recorded |
| Real portable entity key | No populated live entity evidence recorded |
| Wallet-free read checks | Live RPC queries succeeded; catalogue was empty at the most recent check |
| Two storefront sync | Automated fixture rehearsal passes; populated live sync still requires a wallet-published item |
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
