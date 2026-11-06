# Arkiv developer feedback

This feedback describes the FreshMarket implementation and local verification. No user-adoption metrics or successful wallet transactions are inferred from unit tests.

## Public RPC rate limits and two client roles

Calling `rabdi({ accessKey: '' })` emits a public-endpoint rate-limit warning. FreshMarket needs two chain configurations: a domain-restricted key for public reads and a key-free chain shared with browser wallets. That separation is easy to miss because both are built with the same helper. A React example that explains the distinct read/wallet roles and origin restriction up front would help. Reproduce by starting without `NEXT_PUBLIC_ARKIV_ACCESS_KEY`; both the SDK and app report the warning.

## Schema encoding and boundary types

The SDK distinguishes typed u64 attributes from bare bigint values and restricts str values by UTF-8 byte length. We store description and image references as bytes, price and createdAt as explicit u64, and validate byte lengths independently of character counts. Examples showing non-ASCII titles and long descriptions would make the limits clearer. The real SDK serialization tests in `src/__tests__/listing-repository.test.ts` reproduce the expected wire format without signing a transaction.

## Expiration extension is a replacement deadline

`extendEntity({ expiration: ExpirationTime.fromDays(7) })` sets seven days from now; it does not add seven days to the current expiry. The docs explain this, but a prominently named add-lifetime example would prevent accidental shortening attempts in renewal UIs. FreshMarket rereads the deadline and uses `atBlock(existingExpiry + additionalBlocks)`. `listing-lifecycle.test.ts` verifies the distinction.

## Confirmed transactions versus public read-back

The application must retain a confirmed transaction/entity reference even when public reads have not caught up. We implement bounded public-read backoff, explicit delayed-indexing states, and no mutation retry. This is tested with transport mocks; the repo does not claim a measured live indexing delay. A documented SDK read-after-write helper with cancellation and a structured delayed result would simplify this flow.

## Ecosystem integration friction

RainbowKit's cuer dependency requested `border: 0`, while the resolved qr version rejected it with `RangeError: invalid border=0`. Pinning cuer's qr dependency to 0.5.5 fixed the reproducible startup crash. This is wallet UI dependency friction, not an Arkiv protocol defect. WalletConnect sessions also require approval of the custom Rabdi chain; FreshMarket connects with Ethereum as a fallback and switches explicitly to Rabdi. A real mobile-wallet compatibility pass remains outstanding.

Turbopack's CSS worker could not bind a port in the agent sandbox. Production verification uses Next's Webpack option. This is an environment limitation, not evidence of an Arkiv failure.
