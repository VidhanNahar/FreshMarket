# Sepolia ENSv2 storefront identity

## Start here: setting up your first parent name

A parent name is the project-owned namespace. For example, owning `your-market.eth` lets the project issue `alice.your-market.eth`. The example `freshmarket.eth` in the issues is not an ownership or availability claim.

1. Create or use a **test wallet** in MetaMask/Rabby and enable Ethereum Sepolia (chain ID **11155111**). ENS uses Sepolia ETH; Arkiv uses Rabdi test tGLM. These are separate balances and networks.
2. Request Sepolia test ETH using a faucet linked from [Ethereum's Sepolia resources](https://ethereum.org/developers/docs/networks/#sepolia). Fund both the project/issuer wallet and any separate seller wallet that will update its own records.
3. Open the official [Sepolia ENS app](https://sepolia.app.ens.domains/), connect the project wallet, search for an available second-level `.eth` name, and follow the app's registration and wallet approval steps. Wait for confirmed registration and verify that your wallet is the owner in the [Sepolia ENS Explorer](https://sepolia.explorer.ens.domains/). A search result alone is not a registration. Do not use Ethereum Mainnet for this test.
4. Add the actual registered parent to `.env.local`:

   ```dotenv
   NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
   NEXT_PUBLIC_ENS_PARENT_NAME=your-actual-parent.eth
   ```

   Replace the example name with your own. Leave the contract overrides blank to use the verified deployment defaults. No seed phrase or private key is requested by FreshMarket. Public RPC provider credentials, if used, are browser embedded and must be restricted by origin.
5. Restart `npm run dev` and open **Storefront Identity** at `/identity`. Connect the parent-owner wallet and explicitly select **Switch to Ethereum Sepolia for ENS**. The app never switches networks automatically.
6. Expand **Parent registry setup** and choose **Find existing parent registry** first. If ENS already attached a registry, reuse it; the app refuses to replace one. If there is none, select **Deploy project UserRegistry**, approve that deployment, keep its address/transaction link, then select **Attach registry to parent** and approve the separate attachment. The attach flow verifies parent ownership and the official factory implementation.
7. A registry that was created elsewhere may not authorize your wallet to issue names. Its administrator must grant `ROLE_REGISTRAR` on the root resource; ordinary seller ownership is not issuer authority. The app reports missing permission rather than granting itself access. Do not replace a populated registry to bypass this check.
8. Optionally pin the confirmed registry using `NEXT_PUBLIC_ENS_SUBREGISTRY_ADDRESS` and restart. If set, the pin must match the actual parent's onchain pointer. `npm run verify:ens` then also prints the parent's discovered subregistry.

The public template is `.env.example`. No parent is configured by default, so registration stays disabled until you complete these steps.

## Issue a storefront and prove its seller identity

Use `/identity`; each action is an explicit, separate wallet transaction:

1. Enter a handle such as `alice` and the **seller's actual wallet address**. New handles allow 1–32 ASCII letters/digits/internal hyphens. The complete name is shown before submission.
2. Select **Prepare seller resolver and forward address**. This deploys a dedicated `PermissionedResolver` proxy through ENS's `VerifiableFactory`, grants address/text authority to the seller, and initializes the full name's ETH address record to that seller. Keep the resolver address. The payer/deployer may be the issuer; resolver record roles belong to the seller supplied in the form, not implicitly to that payer.
3. Connect the parent registry's authorized issuer and select **Register seller-owned subname**. The app simulates `UserRegistry.register`, assigns the seller as token owner, verifies the exact `LabelRegistered` log (registry, label/hash, owner, issuer, expiry), then checks current token ownership and forward resolution. The seller's token receives name-level renewal, resolver/subregistry management and transfer permissions, not project-wide registration rights.
4. Connect the **seller wallet** on Sepolia, keep the same handle, and save the avatar/description/website if wanted. Only HTTPS avatar/website URLs without credentials are accepted. Profile setters operate on the dedicated ENSv2 resolver using DNS-encoded names. Existing arbitrary resolvers are not silently written with the wrong ABI.
5. Select **Set this storefront as my primary ENS name** and approve. This changes that wallet's Sepolia primary name using the reverse registrar currently read through ENSv2's reverse mirror. It does not change the wallet's Mainnet primary name or any Arkiv listing data. The service verifies reverse, forward and ownership after confirmation.
6. Open a listing owned by that same seller wallet. Product cards, detail views and My Listings resolve the identity independently of Arkiv. A verified badge means the reverse claim, forward address and current ENSv2 owner matched at the checked Sepolia block; it is not a reputation score or marketplace endorsement. The original address stays in the tooltip and profile view.

The operator retains root permissions in the project registry. Seller token ownership is not a promise of irreversible/emancipated subname ownership; a parent administrator or parent expiry can affect the namespace. Parent registration duration must cover the intended demo. Do not promise that a subname outlives its parent.

## Network isolation and resilience

- Arkiv public clients, schema, entity owner checks and query-key namespace are unchanged. ENS has its own six-second HTTP transport and `ens-storefront-identity` cache prefix with chain ID, RPC and deployment addresses.
- ENS identity reads do not use Wagmi, prompt a wallet, or wait before rendering a listing. Absent names, loading, RPC errors and failed verification show the original shortened address. Identity queries deduplicate per seller, are fresh for 60 seconds, and do not automatically retry. A refresh/error removes the stale verified badge until checks succeed again.
- Ownership, forward resolution and reverse resolution use the same block snapshot. Optional text failures do not discard a valid wallet/name association. CCIP-read HTTP callbacks are disabled, so offchain-only identities fall back instead of fetching arbitrary resolver URLs.
- Write adapters require both configured Sepolia chain metadata and the provider's actual `eth_chainId`. They never switch the wallet themselves and disable send retries at both transport layers. Simulation precedes wallet signing.
- The navbar allows Sepolia on `/identity`; returning to sell/manage listings requires an explicit Rabdi switch. A Sepolia wallet never becomes an Arkiv write client.
- Pending hashes lock further ENS actions until confirmation is known. Receipt/event/read-back failures keep the explorer link; **Check submitted transaction** performs a read rather than recreating anything. Closing the page/reloading loses the in-memory lock, so save the link and check its receipt before retrying. This is not an exactly-once guarantee if a provider broadcasts before returning a hash.

## Delegated storefront permissions and `/storefront/settings`

Sources checked: `PermissionedResolver.sol`, `PermissionedResolverLib.sol` and `EnhancedAccessControl.sol` at the pinned commit.

- **Roles.** Each seller resolver is initialized with `ROLE_SET_ADDRESS | ROLE_SET_TEXT | ROLE_SET_TEXT_ADMIN` at its root. The admin role (`ROLE_SET_TEXT << 128`) is what lets the seller grant and revoke delegates. A resolver prepared without it rejects `grantSetterRoles` with `EACCannotGrantRoles`. That is proven live below, and the settings page tells the owner to prepare a new resolver.
- **Grant.** `grantSetterRoles(setText(name, key, ""), delegate)`. The resolver's own `grantRoles` is disabled. The resolver derives the resource as `keccak256(key)`, so the grant covers exactly one text key. Only `freshmarket.description`, `freshmarket.contact`, `description`, `url` and `avatar` can be delegated. Address records and root roles are never delegated.
- **Revoke.** `revokeRoles(keccak256(key), ROLE_SET_TEXT, delegate)`, then a `roles()` read confirms the role is gone.
- **Isolation.** EAC resources are scoped by key, not by name. A delegate for `url` could edit `url` on *every* name served by that resolver. That is why every seller gets a dedicated, factory-verified PermissionedResolver, and the delegation service refuses any other resolver. ENS permissions never authorize Arkiv listing changes; those remain the listing owner's wallet signature.
- **Unauthorized edits.** Writes are simulated before signing. The resolver's `EACUnauthorizedAccountRoles` revert is shown as a clear "no permission" error and nothing is broadcast. **Check permission** on the settings page makes the same `eth_call`, so the verdict comes from the contract itself.
- **Delegate list.** `EACRolesChanged` logs are scanned in 45k-block windows, back to the resolver's `Initialized` event (at most about 6 months). These logs only nominate candidates. A delegate is listed only if a live `roles(keccak256(key), account)` read confirms the role.
- **Settings page.** `/storefront/settings` shows the name, the parent and the subname, the token owner, the resolved address, the resolver, the registry, the expiry, every delegable text record, the active delegates, grant and revoke controls (owner only) and a record editor for owners and delegates. Each action reports its status, raises a toast and links to Etherscan. All state is read live; nothing is mocked.

### Live proof against the real Sepolia contracts

`src/__tests__/ens-delegation-live.test.ts` uses `eth_simulateV1` to run the issue's sequence against the deployed `VerifiableFactory` and `PermissionedResolver` implementation. It uses the app's own calldata builders and seller role bitmap. State carries over between calls; nothing is signed or broadcast, so no keys or test ETH are needed.

1. Deploy a seller resolver with the app's `initialize()` payload. Succeeds.
2. Owner grants `freshmarket.description` to the manager. Succeeds.
3. Manager edits it. Succeeds, and the value reads back.
4. A stranger edits it. Reverts with `EACUnauthorizedAccountRoles`.
5. The manager edits `url`, a key it was not granted. Reverts with `EACUnauthorizedAccountRoles`.
6. Owner revokes. Succeeds.
7. Manager edits again. Reverts with `EACUnauthorizedAccountRoles`, and the value is unchanged.
8. Extra checks: an owner without `ROLE_SET_TEXT_ADMIN` cannot grant (`EACCannotGrantRoles`), and a delegate cannot re-delegate or revoke the owner.

```bash
npm run test:ens-live
```

The same sequence was then run with real signed transactions on `alice.freshmarket.eth`; see [ENS_QUALIFICATION.md](../ENS_QUALIFICATION.md).

## Contract sources and ABI choice

Deployment addresses are pinned in [shared/ens-deployment.json](../shared/ens-deployment.json), from ENS's official Sepolia deployment at commit `07e55a056f5b6a9c90119f501bdd05714e67dddd`. The minimal ABIs in `src/lib/ens/contracts.ts` were checked against that deployment's artifacts. Deployment addresses can change on testnets; review the [canonical deployment list](https://docs.ens.domains/learn/deployments/) before changing overrides. The client deliberately uses the pinned `UniversalResolverV2` at `0x24E1D8e068620B647CA097f961A61055f4f42D72`, whose `ROOT_REGISTRY()` was verified against this deployment. The shared canonical proxy timed out on that getter during compatibility checking; its address is retained as reference metadata, not silently used for identity ownership proofs. A resolver/root mismatch fails closed with an address fallback and blocks subname issuance.

NameWrapper is the legacy ENSv1 ownership path, not the current ENSv2 registry API. This implementation uses `UserRegistry`, `PermissionedResolver` and `VerifiableFactory`; see [ENSv2 subnames](https://docs.ens.domains/ensv2/subnames/). The deployed `PublicResolverV2` is not interchangeable with a per-seller permissioned resolver. Reverse writes are intentionally the existing reverse-registrar path mirrored by ENSv2; see [reverse resolution](https://docs.ens.domains/ensv2/reverse-resolution/).

## Live evidence

A real, wallet-free contract read succeeded on Sepolia at block **12077239**, UTC **2026-11-06T14:46:25.168Z**. The configured ENSv2 root routed `.eth` to the expected ETHRegistry, the root's `getState(labelhash('eth'))` returned `REGISTERED` (`2`), and the pinned UniversalResolverV2 reported the same root. Full public output is [sepolia-read-proof.json](sepolia-read-proof.json). Reproduce:

```bash
npm run verify:ens
```

The project's own parent `freshmarket.eth`, its subname registry, `alice.freshmarket.eth`, the seller's resolver and records, and a real grant → delegated edit → revoke sequence are all live on Sepolia. Every transaction is listed in [ENS_QUALIFICATION.md](../ENS_QUALIFICATION.md).

## Automated verification

`npm test` covers claim/owner/forward mismatches, consistent block reads, text-record failures, cache isolation, transaction event checks, wrong-chain rejection, no automatic send retries, duplicate-click locks and receipt-only recovery. Live checks: `npm run verify:ens`, `npm run verify:ens-delegation` and `npm run test:ens-live`. Current results are in [TEST_REPORT.md](../TEST_REPORT.md).
