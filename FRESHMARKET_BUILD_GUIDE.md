# FreshMarket — ETHGlobal Mumbai 2026 Build Guide

> **Purpose:** A practical, phase-by-phase engineering specification and reusable AI coding prompts for a two-person team building from scratch at ETHGlobal Mumbai 2026. Follow the phases in order; do not fabricate commit history or pretend features have been tested. The project's primary target is **Arkiv — Build on Arkiv (From Scratch)**. Optional later targets are **Arkiv + Swarm bonus**, **ENSv2**, and **Whitechain** only if actually implemented and their separate requirements are satisfied.

## 0. Product definition — freeze this scope

**Product:** FreshMarket — a wallet-owned, portable second-hand marketplace with time-limited listings.

**User problem:** Second-hand marketplaces accumulate outdated listings, trap sellers' listing data in one platform, and make availability difficult to trust.

**Promise:** A seller publishes an item once, maintains control over its status and availability, and can have the same Arkiv-owned listing displayed by more than one independent storefront. Listings have a defined lifetime, and the seller can extend it.

**MVP:**
1. Buyer can browse/search listings without connecting a wallet.
2. Seller connects a wallet on Arkiv Rabdi testnet and creates a listing stored as an Arkiv entity.
3. Seller can view their listings and modify price/description/status, extend expiry, or delete (subject to actual Arkiv ownership rules).
4. Listing statuses: `available`, `reserved`, `sold`. **Sold is not the same as expired** and is not automatically deleted. Seller must explicitly change status or delete it.
5. An active marketplace query shows only `available`, nonexpired listings. `reserved`/`sold` listings can still appear in a seller's history or detail views while the entity exists.
6. Entities expire at their chosen deadline unless the owner extends them. Do not imply Arkiv automatically knows when a real-world sale occurred.
7. A secondary minimal read-only storefront queries the same Arkiv entities, proving portable listings independent of FreshMarket's application database.
8. At least one deployed public demo and reproducible end-to-end walkthrough using real Arkiv writes and reads.

**Out of scope for MVP:** Crypto checkout, real-money payments, shipping, dispute resolution, trustless physical delivery, AI recommendations, Solidity auctions, automatic purchase verification, Go API, PostgreSQL as the authoritative listing store, complex reservation locking. **Status `reserved` is seller-managed only**, not an atomic booking guarantee.

### Distinctive demo

Seller publishes a laptop listing in FreshMarket → second independently hosted storefront finds it via Arkiv → seller changes price / marks `reserved` then `sold` → both storefronts reflect the status from Arkiv → seller extends the deadline of a different listing → an intentionally short-lived test listing expires from active discovery. Explain that no private FreshMarket database controls the portable records.

## 1. Final tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js App Router, React, TypeScript, Node.js LTS |
| Styling | Tailwind CSS, shadcn/ui |
| Wallet UX | Wagmi, RainbowKit |
| Web3 utilities | Viem |
| Arkiv database | `@arkiv-network/sdk`, Arkiv Rabdi testnet |
| Remote data | TanStack Query for caching/invalidation |
| Forms | React Hook Form + Zod (optional but recommended) |
| Images | For MVP, externally hosted product-image URL, validated and clearly attributed/owned; do not store large image blobs as Arkiv attributes. Swarm later if time |
| Testing | Vitest for utilities; optional Playwright for critical E2E |
| Deployment | Vercel for web; independent read-only storefront can be a second deployment or separate app |
| Contracts | **None required** for MVP; Solidity + Foundry only after proof of the main Arkiv flow |

**Arkiv testnet reference (verify during setup):** Rabdi chain ID `7794095`. Get an access key from https://hub.arkiv.network/access-keys and faucet funds from https://hub.arkiv.network/faucet . Official integration guide: https://docs.arkiv.network/guides/react/ . Prize requirements: https://ethglobal.com/events/mumbai/prizes .

**Critical integration details:**
- Use `rabdi({ accessKey })` for **public read client** and `rabdi({ accessKey: "" })` as wallet chain in wagmi. The browser-visible access key must be restricted to allowed Origins at Arkiv Hub; it is not a private secret.
- Write using `createWalletClient` from `@arkiv-network/sdk` backed by wagmi's connected wallet transport; never hardcode a private key or use `window.ethereum` directly in a wagmi app.
- Follow the official SDK's current `defineSchema`, `createEntity`, `.select().from().fetch()`, entity update/delete and expiration APIs. **Do not invent method signatures**. Read docs before implementing each mutation.
- Set expiration when creating an entity (for example, using `ExpirationTime.fromDays(7)` in the current SDK). Wallet approval and transaction confirmation are real asynchronous steps.
- Arkiv is a blockchain-backed database, **not** a zero-latency local database. Show pending and confirmed states, handle indexer lag, and invalidate/refetch queries after writes.

## 2. Architecture boundaries — future-proofing requirement

Do **not** couple product UI to a specific wallet provider, ENS, or payment token. Use these boundaries:

```text
apps/
  web/                         # Next.js seller + buyer marketplace
  storefront-demo/             # Optional minimal independent Arkiv reader (later phase)
packages/                      # Optional if monorepo overhead is worthwhile
  shared/                      # Common DTOs and validation
# An equivalent single-app /src folder layout is acceptable in early phases.

src/
  app/                         # UI routes only, thin server/client components
  components/                   # Presentation
  features/listings/            # Forms, cards, seller panel, hooks
  lib/arkiv/                    # Chain config, schema, queries, write operations
  lib/wallet/                   # Wallet integration
  domain/                       # Product types, listing rules, validation
  services/
    listing-repository.ts       # Interface for catalog persistence
    identity-service.ts         # Interface, initial wallet-address implementation
    checkout-service.ts         # Interface, initially `not supported`
```

**Required conceptual interfaces (adapt to idiomatic TypeScript):**

```ts
interface ListingRepository {
  search(filters: ListingFilters): Promise<Listing[]>;
  getById(id: string): Promise<Listing | null>;
  listOwnedBy(wallet: string): Promise<Listing[]>;
  create(input: CreateListingInput): Promise<WriteReceipt>;
  update(id: string, patch: UpdateListingInput): Promise<WriteReceipt>;
  extendExpiry(id: string, duration: number): Promise<WriteReceipt>;
  remove(id: string): Promise<WriteReceipt>;
}

interface IdentityService {
  getConnectedAddress(): `0x${string}` | null;
  getDisplayName(address: `0x${string}`): Promise<string>;
}

interface CheckoutService {
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
}
```

These are **architectural sketches, not presumed Arkiv SDK APIs**. Implement a working `ArkivListingRepository`; a wallet-address identity service; and **do not** add a fake working checkout service to the UI. Don't overengineer abstractions: clean functions/modules are sufficient if they maintain separation.

### Listing data model

Suggested indexed attributes in Arkiv (adjust fields and types to current SDK/schema constraints):

| Field | Purpose | Indexed? |
| --- | --- | --- |
| `schemaVersion` | Data evolution | Optional |
| `seller` | Wallet public address | Yes |
| `category` | Electronics, bikes, furniture etc. | Yes |
| `status` | `available / reserved / sold` | Yes |
| `priceMinor` | Integer minor currency units; avoid floating point | Yes if range filtering is supported |
| `currency` | e.g. `INR` (display/listing only, **not a payment**) | Yes if useful |
| `city` | Coarse public city (never exact home address) | Yes |
| `title` | Listing title | Maybe |
| `description` | Product details | No, unless actual text filtering is supported |
| `imageUrl` | Public URL or later Swarm reference | No |
| `createdAt` / `updatedAt` | Display/consistency if supported reliably | Maybe |
| Arkiv entity key / owner / expiration | Supplied by Arkiv; use as authority | N/A |

**Entity ownership:** Connected seller wallet must own the entity; client UI visibility is not authorization. The SDK/network must enforce owner mutation rights. Show an unauthorized edit attempt failing in tests/demo when feasible.

**Query behavior:** `active` = entity has not expired **AND** `status = available`. `reserved` and `sold` are independently stored states, not automatic expiry conditions. Expiration removes entities from ordinary active discovery under Arkiv lifecycle rules; don't promise permanent history after expiry. If archival history is desired later, use separate explicitly designed records.

**Privacy:** Store no customer names, street addresses, phone numbers, secret contact details, or sensitive personal data in public Arkiv entities. A public image URL can reveal information; seller must choose what they publish. Do not claim to verify physical ownership of items.

## 3. Working rules for the AI coding assistant

Paste this **global instruction** at the beginning of each AI coding session:

> You are a senior TypeScript/Next.js engineer building FreshMarket from scratch for ETHGlobal Mumbai 2026. The specification is `FRESHMARKET_BUILD_GUIDE.md`. Work **only on the current numbered phase**. Use current official Arkiv documentation (https://docs.arkiv.network/guides/react/ and relevant SDK references) before writing code, and do not invent Arkiv APIs or fake blockchain transactions. Keep the marketplace's core data in real Arkiv entities owned by connected seller wallets. The frontend must not depend on any ENS, Whitechain, Go, Solidity, or private relational database to work. Use clear loading/error states, strict TypeScript, small tested modules, and simple accessible UI. Do not add features outside the phase. At the end, report files changed, commands run, test results, environmental setup, known blockers, and a **suggested** conventional commit message. **Never claim tests ran unless you ran them; never commit or push unless the human explicitly directs you. Never fabricate past work or backdate commits.** Ask for secrets only as environment variables; never expose or commit them.

### Git discipline — important for hackathon proof

1. Create the repository during the permitted From Scratch window. Do not import prebuilt project-specific implementation from before kickoff.
2. Make each phase an actual working increment. Run build/lint/tests before you commit, where possible.
3. **Commit when work is real**, not on a fake timer. Keep intermediate bugfix/refactor commits if that's how work progresses. Push regularly during the hackathon, not one giant upload at the end.
4. Commit a meaningful README early, update it as work evolves, and document actual limitations.
5. Add AI-assistance disclosure in README: which tools were used, which portions were assisted, what was manually reviewed and tested. Respect ETHGlobal's rules.
6. Never commit `.env.local`, wallet seed phrases, private keys, restricted access tokens, or identifiable user data.

## 4. Phase-by-phase implementation prompts

**Time allocations are planning budgets, not guaranteed durations.** If the actual submission deadline is sooner, cut optional phases and reserve several hours for testing and submission. Check the event dashboard for the exact deadline.

### Phase 0 — Scaffold and working dev setup (budget: 1–2 hours)

**Goal:** Web app starts, repo exists, wallet/dependency versions are locked.

**Prompt to AI:**

> Implement Phase 0 only. Scaffold a clean Next.js App Router TypeScript application with Tailwind and shadcn/ui. Set up ESLint and strict TypeScript. Add a minimal landing page and placeholder routes `/browse`, `/sell`, `/my-listings`, `/listing/[id]`. Install only the dependencies needed for Arkiv + Wagmi + RainbowKit + Viem + TanStack Query. Add `.env.example` for NEXT_PUBLIC_ARKIV_ACCESS_KEY and the WalletConnect project ID as appropriate. Include `.gitignore`, MIT LICENSE, and a README stating the product goals and current limitations. Verify the development server and build. Do not pretend to integrate Arkiv yet.

**Acceptance:** `npm run dev` works, `npm run build` succeeds, env example exists, no secret committed.

**Suggested commit:** `chore: scaffold FreshMarket app and tooling`

### Phase 1 — Wallet connection + Rabdi (budget: 2–3 hours)

**Goal:** Connect a real browser wallet, switch to Rabdi, query network state.

**Prompt to AI:**

> Implement Phase 1 only using the official Arkiv React guide. Configure wagmi/RainbowKit and Arkiv Rabdi, including **separate chain config for read client (restricted access key) and wallet (no access key)**. Show connected wallet address, current network, and Rabdi connection status. Require the right chain before seller writes. Build shared providers and Arkiv client modules. Add informative errors for missing access key, insufficient faucet funds, wallet rejection, or wrong chain. Verify real testnet read; do not mock successful network connectivity. Update README with Arkiv faucet/access-key setup.

**Acceptance:** Wallet connects, wrong-chain handling works, a real testnet read is verified, screenshot/notes saved.

**Suggested commit:** `feat: connect seller wallets to Arkiv Rabdi`

### Phase 2 — Arkiv schema + first real listing (budget: 3–4 hours)

**Goal:** Prove an Arkiv write and read before building a polished UI.

**Prompt to AI:**

> Implement Phase 2 only. Define one versioned `freshmarket.listings` Arkiv schema using the current SDK's `defineSchema` and appropriate indexed attributes. Implement the repository with `createListing` and `getListingById`. Build a minimal seller form with Zod validation and write via the connected wallet's Arkiv wallet client. Require an expiration when writing; default to 7 days. Store a public image URL, not image bytes. Display pending wallet confirmation and successful entity key/transaction evidence. Read the entity back through the **Arkiv public client** and render the exact returned data. Reject invalid price, negative values, overlong text and unsupported image URLs. Update `/arkiv/schema.md` with real fields and ownership/expiration rules.

**Acceptance:** One listing is created on Rabdi by a real seller wallet; it can be found by a fresh public query. Record actual writing wallet and entity key in README (public only).

**Suggested commit:** `feat: persist seller-owned listings in Arkiv`

### Phase 3 — Buyer discovery (budget: 3–4 hours)

**Goal:** A buyer browses real, queryable Arkiv data.

**Prompt to AI:**

> Implement Phase 3 only. Create responsive listing cards and detail pages and a `/browse` route. Query **Arkiv directly** for available nonexpired listings using supported indexed attributes. Add category, city, status and price controls only where supported by actual Arkiv query/index capabilities. Implement pagination if supported or a clearly bounded result set. Public browse must not require a wallet. Use TanStack Query caching/invalidation; handle empty states, loading, rate limits and indexer delays. Avoid fake/demo listing data on the public production flow; optional fixture data must be explicitly labeled and kept in tests.

**Acceptance:** A separate browser can discover the listing without wallet connection; searching/filtering uses real Arkiv data.

**Suggested commit:** `feat: add Arkiv-backed marketplace discovery`

### Phase 4 — Seller lifecycle controls (budget: 3–4 hours)

**Goal:** Seller chooses when to mark sold, reserve, extend or remove.

**Prompt to AI:**

> Implement Phase 4 only. Add `/my-listings` querying the connected seller's actual Arkiv-owned entities. Implement owner-initiated `updateListing`, `markReserved`, `markSold`, `markAvailable`, `extendExpiry`, and `deleteListing` with the exact supported current Arkiv SDK methods. Document the difference between sold status and database expiration. **Never automatically expire or delete a sold listing.** Display sold/reserved listings in the owner's panel while they exist, but exclude them from default active browsing. Let the owner extend expiration before it elapses. Verify cross-wallet unauthorized modification is rejected by the chain or SDK. Show transaction confirmation and read-back verification before announcing status success.

**Acceptance:** Seller can change listing status, edit price and description, extend expiry, delete; buyer sees updates; other wallet cannot mutate it.

**Suggested commit:** `feat: support seller-managed listing lifecycle`

### Phase 5 — Expiration and resilient UX (budget: 2–3 hours)

**Goal:** Correct behavior for entity expiry, staleness and errors.

**Prompt to AI:**

> Implement Phase 5 only. Add a user-visible expiry deadline and countdown based on confirmed entity expiration metadata (not merely a client clock guess). Ensure active discovery excludes expired entities using actual Arkiv query/lifecycle behavior. Build one short-lived fixture listing for a reproducible expiry demo; don't hardcode expiry success. Clarify that a seller can renew before expiry, and that expired entity history may no longer be queryable. Add retries/refetch on indexing lag, wallet rejection messaging, skeletons, and a basic error boundary. Write Vitest tests for filtering/status mapping and expired-versus-sold behavior.

**Acceptance:** Real listing expires and disappears from active discovery; sold listing remains separate; no false transaction success or stale UI claim.

**Suggested commit:** `feat: handle Arkiv expiration and listing states`

### Phase 6 — Two storefront portability proof (budget: 2–3 hours)

**Goal:** Demonstrate why Arkiv, not a private Postgres catalog.

**Prompt to AI:**

> Implement Phase 6 only. Build a tiny independent read-only storefront with a different look and no shared server-side listing database. It must query the same Arkiv schema and display available listings. Do not import or fetch the main app's private API. Show a real price/status change by the seller in FreshMarket reflected in both storefronts after confirmation/refetch. Add reproducible instructions and URLs to README, and a short architecture diagram explaining seller-owned portable data. If deploying a second app is too slow, use a separate standalone page/app with a visibly independent Arkiv public client and clearly document the limitation.

**Acceptance:** Two independent interfaces read one real wallet-owned Arkiv entity and show its updated data.

**Suggested commit:** `feat: demonstrate portable listings across storefronts`

### Phase 7 — Polish, evidence, sponsor deliverables (budget: 3–5 hours reserved)

**Goal:** A fully reproducible and demonstrable submission.

**Prompt to AI:**

> Implement Phase 7 only. Polish navigation, accessibility, mobile layout and wallet feedback without rewriting working Arkiv interactions. Add a deterministic demo walkthrough and a smoke-test checklist. Create/update the required `/arkiv/schema.md`, `/arkiv/friction.md`, `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, and `/arkiv/how-you-use-arkiv.md` with truthful, concrete evidence. Include in README: live demo URL, real writing wallet address(es), a working Arkiv query users can run, setup, architecture, limitations, current SDK versions, project-specific AI use disclosure, and a link to the MIT license. Do not invent user numbers, transaction hashes, or successful test results. Run lint/build/test and report results. Write concise submission copy and a demo script.

**Acceptance:** Live demo works, Arkiv create/query/update/expiration demonstrated, docs exist, repo is public, genuine commit history, no credentials committed.

**Suggested commit:** `docs: prepare Arkiv hackathon submission and demo`

### Optional Phase 8 — Swarm product media (only after Phases 0–7)

**Prompt to AI:**

> Integrate product-image uploads/reads through Swarm using official APIs and a valid postage-stamp batch. Store the appropriate Swarm reference in the seller-owned Arkiv listing, not the image binary. Confirm the image loads in both independent storefronts. Add `/arkiv/swarm.md` with real entity key, Swarm reference, accessible link, postage stamp batch ID, Bee node/service, files used, commands to upload/read, and honest integration feedback. Never publish an encrypted Swarm reference containing its decryption key in a public entity.

**Suggested commit:** `feat: store marketplace images on Swarm`

**Avoid:** Implementing onchain auction mechanics or payments to fill unused time before real Arkiv evidence and submission are complete.

## 5. Two-developer parallel workflow

| Person A — Arkiv integration | Person B — product UI and testing |
| --- | --- |
| Phase 1: chain, public client, wallet client | Phase 0: scaffold, UI base |
| Phase 2: schema, entity create/read | Seller form and validation UI |
| Phase 3: repository queries, indexes | Browse/cards/detail route |
| Phase 4: entity mutations, owner checks | Seller dashboard/status UX |
| Phase 5: expiry tests and chain behavior | Error states, responsive polish |
| Phase 6: independent read-only query module | Second storefront visual demonstration |
| Phase 7: docs, sponsor requirements | Tests, deployment, demo recording |

**Integration rule:** Coordinate on the schema and repository types early, then merge through small reviewed commits. Don't have both developers modify the same wallet and Arkiv files simultaneously. Do a joint integration check at least after Phases 2 and 4.

## 6. Verify the actual sponsor requirements

Primary target: **Arkiv — Build on Arkiv (From Scratch)**. The official prize listing requires:
- Built from scratch during ETHGlobal Mumbai.
- Actual entity writes using `@arkiv-network/sdk` or Arkiv JSON-RPC on the current testnet.
- At least one user-facing feature reads data from Arkiv; installation or append-only unused logs do not count.
- README names real writer wallet(s) and provides one reproducible query.
- `/arkiv/schema.md`, `/arkiv/friction.md`, and the criterion files `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md` with genuine evidence.
- Public open-source repository, license, clear AI-use disclosure.

Optional Swarm bonus requires real Arkiv + Swarm usage and `/arkiv/swarm.md` with traceable evidence. The bonus does **not** require a separate partner-sponsor selection when attached to Arkiv's eligible main track; see current prize page.

### Questions the README must answer

- **Why Arkiv?** Listings belong to seller wallets and can be queried by competing storefronts without asking FreshMarket for database access. Using ordinary Postgres owned by FreshMarket would introduce a central platform permission/dependency. A public Postgres API could also provide portability, but would still depend on its operator; be honest about the tradeoff and Arkiv's costs/expiry model.
- **Who uses it?** Second-hand sellers and small resale communities; don't claim adoption until measured.
- **How do Arkiv features matter?** Ownership controls seller edits; indexed attributes enable marketplace filtering; expiration removes abandoned listings from active discovery; the second storefront proves cross-app reads.
- **What stays off Arkiv?** Private buyer chat, contact details, shipping addresses, raw product image bytes and secrets.

## 7. Future additions: ENSv2 and Whitechain (NOT part of current MVP)

### ENSv2 — merchant identity, not a replacement for wallet authentication

**Goal:** Display `seller.example.eth` instead of a bare address; optionally support merchant subnames and delegated record management.

**How to add later:**
1. Implement `EnsIdentityService` behind `IdentityService` for address/name resolution and display.
2. Add ENSv2 registries/subnames/permissioned resolvers **only if** targeting ENSv2's actual prize; simple name lookup alone does not meet its key qualification.
3. Keep wallet signature or connected-wallet authorization for Arkiv writes. ENS names and text records do not by themselves authenticate a user or prove legal identity.
4. Seller's Arkiv owner address remains the authorization source until a thoughtfully designed migration/delegation model exists. Do not assume ENSv2 roles on Ethereum automatically authorize writes on Arkiv.
5. Use chain-specific clients; ENSv2 lives on Ethereum mainnet/Sepolia, Arkiv listings on Rabdi.

**Impact:** Add service, identity UI, and network integration; no need to replace listing forms and Arkiv repository. Some domain model updates are possible to store optional ENS identifiers.

### Whitechain — payments, not a substitute for Arkiv listing database

**Goal:** Add merchant USDT checkout for a listing with independent settlement and receipt verification.

**How to add later:**
1. Implement `WhitechainCheckoutService` behind `CheckoutService` with explicit `listingId`, seller destination, amount, chain ID, order ID and status.
2. Add checkout routes and wallet network switching. Whitechain Sepolia uses chain ID 1874; verify official USDT contract and current requirements before coding.
3. Store onchain settlement proof / references appropriately. Keep Whitechain as the settlement authority; Arkiv is for marketplace discovery and optional receipts metadata.
4. Prevent double charges and false sales: receiving payment is not the same as delivering a physical item. Use explicit order state and seller-confirmed completion; reconcile onchain events before displaying `paid`.
5. If aiming at **Whitechain Operate**, add a reusable widget/API, merchant and buyer flows, verified contract, real official-test-USDT payment, proof in README, required video and feedback. A payment button alone is insufficient.
6. If aiming at **Whitechain Scale**, independently demonstrate genuinely gasless payer experience and sponsor-relayer protections; it is **not** automatically achieved by adding Whitechain support.

**Status:** Implemented as FreshPay in Phase 10 (issues #32–#38); see [`whitechain/README.md`](whitechain/README.md).

**Impact:** New chain config, checkout module, checkout UI, transaction verification and potentially a Solidity contract. Existing Arkiv browse/search/seller ownership can remain, but listing/order state must be synchronized intentionally. No claim that Arkiv or ENS grants cross-chain authorization automatically.

**Bottom line:** Future integration is **additive, not zero-modification**. We deliberately keep the Arkiv listing repository independent of the identity display and checkout modules to minimize later refactoring.

## 8. Final demo checklist

- [ ] App and repo created during allowed hackathon period.
- [ ] Live public demo and public licensed GitHub repository.
- [ ] Real Arkiv Rabdi read and write, recorded seller wallet address and entity key.
- [ ] Seller can create, edit, mark reserved, mark sold, extend expiration, and remove own listings.
- [ ] Sold status never automatically deletes/expires listing.
- [ ] Public buyer can query nonexpired available listings without wallet connection.
- [ ] Arkiv expiry behavior demonstrated using a real short-lived entity.
- [ ] Different wallet cannot edit another seller's entity (verified test).
- [ ] Two independent storefronts query the same Arkiv entity (priority differentiator).
- [ ] README contains a runnable query and honest AI-use disclosure.
- [ ] `/arkiv/schema.md`, `/arkiv/friction.md`, `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md` completed with real evidence.
- [ ] No leaked secrets, fake txs, fabricated user statistics, or backdated commits.
- [ ] Build/test status honestly documented; demo video recorded; submission completed before actual deadline.

### Recommended 2-minute pitch

> "Second-hand marketplaces are full of stale listings, and a seller has to recreate their catalog on every platform. FreshMarket gives each seller wallet-owned, time-limited product listings on Arkiv. Buyers search the active inventory, sellers control sold/reserved status, and listings expire unless renewed. Here's the difference: the same item appears in two independently operated storefronts, because neither storefront owns the catalog. When the seller updates it, both read the same data."

---

## Links

- Arkiv React integration: https://docs.arkiv.network/guides/react/
- Arkiv docs: https://docs.arkiv.network/
- Arkiv Hub: https://hub.arkiv.network/
- ETHGlobal Mumbai prizes: https://ethglobal.com/events/mumbai/prizes
- ENSv2 docs (future): https://docs.ens.domains/ensv2/overview/
- Whitechain docs (future): https://docs.whitechain.io/

**Start with Phase 0. Do not ask the coding AI to generate the entire project in one shot.**
