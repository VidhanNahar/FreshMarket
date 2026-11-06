# Who FreshMarket serves

FreshMarket is a testnet prototype for local second-hand sellers and buyers. It addresses two practical problems: stale listings that remain visible after their useful lifetime and repeated catalog entry across separate marketplaces.

The intended user is a seller who publishes one public record and controls its availability and deadline with a wallet. Buyers can browse without connecting a wallet. Community storefront operators can implement the public schema and read the same entity keys without asking FreshMarket for a private API key or database export.

## What someone can try today

The repository includes FreshMarket and SECOND LOOK, an independently buildable static storefront. Run `npm ci`, `npm run dev`, then open `/browse`, `/sell`, `/my-listings`, and `/storefront`. SECOND LOOK can be deployed independently from `public/storefront/`; see `storefront/README.md`.

Current public deployment and real writer evidence are not recorded. Local live read checks reached Rabdi successfully but returned zero entities, so they do not demonstrate real adoption or populated catalog sync. Automated portability fixtures test matching IDs, price changes, reserved/sold states and expiry; fixtures are not customers or production usage.

## Reach evidence

- Public source and MIT license: https://github.com/VidhanNahar/FreshMarket
- Reproducible direct Arkiv read: `npm run query:listings` (no wallet or FreshMarket server required).
- Independent reader: `storefront/src/reader.ts`, with public schema and owner validation.
- Rehearsal and genuine evidence requirements: `arkiv/portability-demo.md` and `arkiv/submission-evidence.md`.

No customer counts, interviews, adoption metrics, live deployment claims or post-event delivery commitments have been fabricated. The team must confirm intended post-Mumbai maintenance and actual user feedback before stating either as an achieved result.
