# Security

FreshMarket is a testnet prototype and is **not cleared for an unrestricted production launch**. Passing tests don't prove there are no vulnerabilities. Never put real private keys, Bee credentials or personal data in the repository or in Arkiv entities, which are public.

**Reporting:** contact the maintainers privately (for example through a GitHub private security advisory on this repository). Don't post credentials or exploit details in a public issue.

## Audit and hardening (2026-11-06)

### Scope and conclusion

Reviewed the current main application, independent storefront reader, Arkiv repository and ownership checks, mutation/publication state, cache reconciliation, Swarm upload/auth/media paths, schemas, and deployment assumptions. This is a code/automated-test review, not an external penetration test, formal proof, or complete production certification.

### Reproduced and fixed

| Finding | Trigger and result | Fix / regression coverage |
| --- | --- | --- |
| Premature pagination termination | A full node page containing schema-incompatible records is skipped by the SDK. Readers counted only decoded rows and incorrectly stopped before valid later pages. | Both readers use `entities.length + skipped` for page coverage. Repository and two-reader tests include a full skipped page followed by a valid record. |
| Upload replay and postage consumption | A valid signed body could be submitted repeatedly during its two-minute validity window, including concurrent requests to different serverless instances. | Atomic single-use message claims plus hourly count/byte quotas. Production requires shared Redis REST state; missing/offline state fails closed. Local memory is development-only. |
| Unauthenticated upload body allocation | A caller could claim an allowed public address while supplying an invalid signature and still force image buffering before rejection. | Signatures authenticate declared digest/size/type before body reading; quota is reserved before buffering. Streamed byte length and digest are checked against the signed authorization. A 15-second body deadline cancels stalled readers; client disconnects interrupt reading before Bee is contacted. |
| Stale upload completion | A slow signature/upload could complete after a wallet change or navigation and populate an unrelated current form. | Abort signals cancel the pending signature wait/XHR; stale completions cannot call `onUploaded`. Form reset and image URL editing are blocked while uploading. |
| Publication reset guard only in UI | Calling the publishing hook's reset directly after an unconfirmed submitted hash could discard its duplicate-write lock. | The hook itself refuses reset while a submitted hash lacks a confirmed receipt. Tests retain the hash and reject another create. |
| Undefined optional edits | An explicit `priceMinor: undefined` in an edit could overwrite the required cached price during optimistic preview. | Preview copies only defined fields and trims description like the repository. |
| Unbounded public namespace scans | A large or hostile namespace could keep refresh loops scanning indefinitely and growing cached data. | Readers cap node matches at 10,000, check a 60-second budget between bounded HTTP calls and return an explicit error. No silent partial success. An extra one-record query distinguishes an exact boundary from overflow. |
| Vulnerable ws 8.x transitive versions | Old nested wallet dependencies resolved ws 8.18.0. | A narrow same-major override selects 8.22.1 only for affected 8.x requests; existing 7.x and already-fixed 8.x resolutions are retained. |

Quota reservations are intentionally not refunded on malformed bodies, Bee errors or timeouts: a failed response does not prove the remote node did no work. UI retries require a new signed authorization. Requests exceeding 32 attempts or 16 MiB per wallet/UTC hour are rejected before the image is allocated. Shared state uses one EVAL script and wallet hash-tagged keys; real Redis/Bee interoperability must still be verified in deployment.

### Dependency advisory snapshot

Commands: `npm audit --json` and `npm audit --omit=dev --json`, against the current npm advisory database.

| Snapshot | Total | High | Moderate | Low | Critical |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial full dependency tree | 37 | 15 | 19 | 3 | 0 |
| After compatible ws patch, full tree | 35 | 17 | 15 | 3 | 0 |
| After patch, production dependencies | 27 | 17 | 7 | 3 | 0 |

Counts include meta-vulnerabilities propagated through multiple parent packages; they are not counts of distinct exploitable application paths and severities need not decrease monotonically as the dependency graph is recomputed. No claim is made that the remaining findings are harmless.

Remaining high-severity chains include older WalletConnect/Reown/coinbase Zod 3 dependencies and query-string/decode-uri-component. npm proposes a Wagmi 3 migration for several findings, while installed RainbowKit 2 declares Wagmi `^2.9.0`. Forcing that major upgrade is not a compatible patch. The patched decode-uri-component 0.5.1 is ESM, while the installed query-string 7 uses a direct CommonJS require, so a blind leaf override would risk a broken wallet connector. deepmerge's registry latest was 4.3.1 at review time, with no 4.3.2 available; no fictitious patched release was pinned. Tooling/minimatch and uuid advisories also remain.

References: [ws advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [decode-uri-component advisory](https://github.com/advisories/GHSA-qr28-fpjm-wq7f), [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). Re-run the audit before release because advisories and available fixes change.

## Remaining release risks

1. Resolve or explicitly assess the production dependency advisory chains through a coordinated, compatible wallet-stack upgrade with real extension/mobile-wallet tests. A passing build does not test every connector.
2. Submitted transaction locks are in memory. They do not survive route unmount, reload, another tab or browser restart. A provider can broadcast and then fail before returning a hash. Do not claim exactly-once writes; a durable transaction journal and recovery workflow are required before making that guarantee.
3. Shared replay/quota storage, funded Bee/postage, correct Arkiv/gateway origins, real wallet writes, owner rejection, extension, deletion and live image retrieval still require deployment-level verification. Fixture responses do not establish network enforcement.
4. Public upload infrastructure needs perimeter rate limiting, monitoring and account/storage spending controls. EOA signature recovery does not support arbitrary contract-wallet signatures. File signature checks are not a full image decoder, decompression-bomb defense or moderation system.
5. The 10,000-match/60-second reader guard is a protective prototype limit. Large catalogues require user-visible pagination and narrower node queries. Concurrent writes/expiry can shift offset pages. Public schema/owner checks do not provide moderation or prevent legitimate owners from publishing spam/false item details.
6. Browser visual/Lighthouse checks and real mobile-wallet tests haven't been run. Live Rabdi writes, cross-wallet `NotOwner` rejection and the Vercel deployment are verified (see [TEST_REPORT.md](TEST_REPORT.md)). A funded Bee/postage setup is not.

Do not call the project loophole-free, production-ready, or all edge cases covered on the basis of these checks.

## Verification at audit time

Final automated checks: 217 tests passed, 6 opt-in live tests skipped; ESLint and the production Webpack build passed. The build still emits the existing optional MetaMask React Native storage-module warning. Production HTTP smoke checks passed for the main routes, Storefront B JavaScript asset and redirect. These checks do not replace the pending live-wallet, Redis/Bee, browser visual or deployment checks above.
