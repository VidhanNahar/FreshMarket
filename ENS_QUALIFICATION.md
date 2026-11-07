# ENSv2 qualification: seller identity and delegated storefront management

FreshMarket uses ENSv2 on **Ethereum Sepolia** as seller identity. The project owns `freshmarket.eth`, runs its own subname registry under it, and issues each seller a name like `alice.freshmarket.eth`. Each name has **its own Permissioned Resolver**, so the seller fully controls their records. Sellers can let a shop manager edit **one text record only**, then revoke that right. Every step below is a real Sepolia transaction; the app's `/identity` and `/storefront/settings` pages build and send these same calls.

- **Live demo:** https://fresh-market-tawny.vercel.app (`/identity`, `/storefront/settings`, listing pages)
- **Code:** [`src/services/ens-storefront.ts`](src/services/ens-storefront.ts) (registry, resolver, subnames), [`src/services/ens-delegation.ts`](src/services/ens-delegation.ts) (Enhanced Access Control), [`src/services/ens-identity.ts`](src/services/ens-identity.ts) (resolution shown on listings)
- **Setup guide:** [`ens/README.md`](ens/README.md)

## Architecture

```
Ethereum Sepolia (ENSv2)                                     Arkiv Rabdi
───────────────────────────────────────────────              ─────────────────────────
Root registry ── .eth registry
                   └─ freshmarket.eth  (owner: project wallet)
                        └─ subregistry: PermissionedRegistry 0xa60f…4f4C   ← project-run
                             └─ alice.freshmarket.eth  (owner: seller)
                                  └─ resolver: PermissionedResolver 0xB438…22cE  ← seller's own
                                       ├─ addr        → seller wallet ─────────────┐
                                       ├─ text: description, url, avatar           │
                                       └─ text: freshmarket.description            │
                                            ↑ delegable to a shop manager (EAC)    │
Reverse registrar: seller wallet → alice.freshmarket.eth (primary name)            │
                                                                                   ▼
                                               Listing card / detail shows the name only if
                                               name → address == listing.seller == Arkiv $owner
```

## Why each seller gets their own Permissioned Resolver

- **The seller owns their data.** The resolver is a proxy deployed through ENS's `VerifiableFactory`, and the seller receives the record roles. The project wallet that issued the name holds no record roles on it.
- **Isolation.** One compromised seller resolver can't touch another seller's records, and the project can't rewrite a seller's profile.
- **Scoped delegation.** Enhanced Access Control grants `ROLE_SET_TEXT` on the resource `keccak256("freshmarket.description")`, and nothing else. A delegate can't change `addr`, other text keys, or grant itself more roles. The live test (`ens-delegation-live.test.ts`) checks this against the real resolver bytecode.
- **Identity is checked, never assumed.** A name appears on a listing only if it forward-resolves to the listing's seller, which must also be the Arkiv entity owner. An ENS outage falls back to the plain address and never blocks Arkiv reads.

## Live transactions (Ethereum Sepolia)

| Step | Transaction | From |
| --- | --- | --- |
| Commit `freshmarket.eth` | [`0x1a49c5c3…2528`](https://sepolia.etherscan.io/tx/0x1a49c5c3fa6a62b96f1882c7f7efcd16c0ac72321e32fc7cba6a8dd29a272528) | project wallet `0x2D63…A905` |
| Register `freshmarket.eth` (ENSv2 `ETHRegistrar`, paid in the Sepolia test USDC) | [`0xe766a8b8…c7139`](https://sepolia.etherscan.io/tx/0xe766a8b87d446c4ea784807ecb6f4970ae107bc0dc439b2e8826d9d47c1c7139) | project wallet |
| Deploy subname registry (`UserRegistry` proxy) | [`0x02389bc9…6dee`](https://sepolia.etherscan.io/tx/0x02389bc99c5e3eb8da312c89a43e6de60ee7e655c9cab92bb7f08950210c6dee) | project wallet |
| Attach registry to `freshmarket.eth` (`setSubregistry`) | [`0xf26f9c87…6f47`](https://sepolia.etherscan.io/tx/0xf26f9c875ac0e412f4075d2100bc7b95c528f5f3d3c6c2283e0fc1e64cfb6f47) | project wallet |
| Deploy the seller's own Permissioned Resolver | [`0x64c362bb…6bee`](https://sepolia.etherscan.io/tx/0x64c362bb67468f15d91df1d15a637c29ac78e12fa6ee148ab6fc737b84e26bee) | project wallet |
| Register `alice.freshmarket.eth` | [`0xe3710dc6…25ef`](https://sepolia.etherscan.io/tx/0xe3710dc6ebef3535a1f4aaab7671277bfabe75bc1d4e83f22fced6566fa225ef) | project wallet |
| Set address and profile records (`description`, `url`, `avatar`) | [`0x19e755ba…ae13`](https://sepolia.etherscan.io/tx/0x19e755ba5a2269aa9e85ed87ba63a6c6c3a5aefd8baa49dcf78d7ed00978ae13) | seller |
| Set primary name (reverse record) | [`0x5434828f…853f`](https://sepolia.etherscan.io/tx/0x5434828f1b36e9ba924895f34bfc33cdff1e17c2e78b651c7eee511b0ac0853f) | seller |
| **Grant** shop manager `0xDD4a…f4f5` the right to edit `freshmarket.description` only | [`0x5eb3b6cd…f31b`](https://sepolia.etherscan.io/tx/0x5eb3b6cdb3eff31c10c6658c9d05846b5a04b632b2778666243e00f0e49ff31b) | seller |
| **Delegated edit** by the manager: "Edited by a delegated shop manager" | [`0x945a3e6a…cb5d`](https://sepolia.etherscan.io/tx/0x945a3e6a0181b2f95eadac5780ac100173d99c28eef08115a06c6d33c274cb5d) | manager `0xDD4a…f4f5` |
| **Revoke** the manager's role | [`0x9548cf74…2bed`](https://sepolia.etherscan.io/tx/0x9548cf7486c5c23d9dfe5a4bf4d8818119243d5032bf6933ee0f20bf9fdf2bed) | seller |
| **Edit after revocation fails** | Read-only simulation, below | manager |

A wallet won't broadcast a transaction it knows will revert, so the post-revocation failure is shown by simulating the call on the live resolver:

```bash
npm run verify:ens-delegation
```
```json
{ "block": "12080030", "name": "alice.freshmarket.eth", "key": "freshmarket.description",
  "currentValue": "Edited by a delegated shop manager",
  "ownerCanEdit": true, "revokedManagerCanEdit": false }
```

In this demo, `alice.freshmarket.eth` was issued to the project wallet itself, which is why "project wallet" and "seller" are the same address above.

## Contracts and identifiers

| Item | Value |
| --- | --- |
| Network | Ethereum Sepolia, chain 11155111 |
| ENSv2 deployment | Pinned in [`shared/ens-deployment.json`](shared/ens-deployment.json) (root `0xB458…c43f`, .eth registry `0xD4eB…a8b4`, Universal Resolver `0x24E1…2d72`) |
| `freshmarket.eth` owner | `0x2D63097b7d955d487F06523f05676611146CA905` (expires 2027-11-06) |
| `freshmarket.eth` subregistry | `0xa60f64E0dFC3531316A14be75eFCceF6e21b4f4C` |
| `alice.freshmarket.eth` resolver | `0xB4386FDb621B529658732F62522Da885ecc622cE` |
| Delegated record | `freshmarket.description`, resource `keccak256("freshmarket.description")`, `ROLE_SET_TEXT` |

## How judges can try it

1. Read only, no wallet: `npm run verify:ens` (deployment and parent) and `npm run verify:ens-delegation` (delegation state).
2. In the live app, open **Storefront Settings**, load `alice.freshmarket.eth`, and see its records and current delegates.
3. With a Sepolia wallet: on `/storefront/settings`, the owner of a FreshMarket name can grant a manager one text key, the manager edits it, and the owner revokes it. A revoked or out-of-scope edit is refused before anything is sent.
4. Issuing new `*.freshmarket.eth` names on `/identity` requires the project wallet, since it holds the registrar role on the subregistry.

## Not done

- No listing on Arkiv is currently published by a wallet with a FreshMarket name, so the name-on-listing view needs one more live listing from such a wallet.
- The verified badge (`<label>.verified.freshmarket.eth`) is read by the app, but no verified names have been issued.
