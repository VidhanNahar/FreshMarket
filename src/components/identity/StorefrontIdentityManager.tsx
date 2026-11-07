"use client";

import { useRef, useState } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { type Hex } from "viem";
import { createEnsWalletClient, ensPublicClient } from "@/lib/ens/client";
import { ensConfig, ensConfigurationError, ENS_SEPOLIA_CHAIN_ID } from "@/lib/ens/config";
import { sellerAddress } from "@/lib/ens/names";
import { ensStorefrontService } from "@/services/ens-storefront";
import { ensIdentityKeys } from "@/hooks/use-seller-identity";
import { SellerIdentity } from "./SellerIdentity";

const button = "rounded-lg border px-4 py-2 text-sm font-medium hover:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed";
const field = "mt-1 block w-full rounded-lg border bg-background p-2 text-sm";
type EnsWallet = Awaited<ReturnType<typeof createEnsWalletClient>>;

/** Every button is one explicit transaction. Closing/navigating account UI never auto-retries a send. */
export function StorefrontIdentityManager() {
  const { address, isConnected, chainId } = useAccount();
  const { data: wallet } = useWalletClient({ chainId: ENS_SEPOLIA_CHAIN_ID });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const cache = useQueryClient();
  const lock = useRef(false);
  const unresolvedHash = useRef<Hex | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const [phase, setPhase] = useState("");
  const [txHash, setTxHash] = useState<Hex>();
  const [error, setError] = useState("");
  const [registry, setRegistry] = useState(ensConfig.subregistry === "0x0000000000000000000000000000000000000000" ? "" : ensConfig.subregistry);
  const [resolver, setResolver] = useState("");
  const [label, setLabel] = useState("");
  const [sellerDraft, setSellerDraft] = useState("");
  const [days, setDays] = useState(30);
  const [avatar, setAvatar] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const seller = sellerDraft || address || "";
  const configured = Boolean(ensConfig.parentName) && !ensConfigurationError;
  const disabled = !configured || !isConnected || chainId !== ENS_SEPOLIA_CHAIN_ID || !wallet || busy || unresolved;

  async function run(action: (client: EnsWallet) => Promise<unknown>) {
    if (lock.current || unresolvedHash.current) return;
    lock.current = true;
    setBusy(true); setError(""); setTxHash(undefined); setPhase("Preparing ENS transaction…");
    try {
      if (!wallet) throw new Error("Connect your wallet on Ethereum Sepolia first");
      const client = await createEnsWalletClient(wallet, {
        onSignatureRequested: () => setPhase("Confirm this ENS transaction in your wallet"),
        onSubmitted: (hash) => { unresolvedHash.current = hash; setUnresolved(true); setTxHash(hash); setPhase("ENS transaction pending on Sepolia…"); },
      });
      await action(client);
      unresolvedHash.current = undefined;
      setUnresolved(false);
      setPhase("ENS transaction confirmed and required onchain checks passed");
      // This namespace is separate from Arkiv listing caches, even when the wallet switches chains.
      void cache.invalidateQueries({ queryKey: ensIdentityKeys.all });
    } catch (cause) {
      setPhase(unresolvedHash.current ? "Transaction submitted; check its status before another action" : "ENS action was not completed");
      setError(cause instanceof Error ? cause.message : "Check your wallet and ENS configuration");
    } finally { lock.current = false; setBusy(false); }
  }

  async function checkTransaction() {
    const hash = unresolvedHash.current;
    if (!hash || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const receipt = await ensPublicClient.getTransactionReceipt({ hash });
      unresolvedHash.current = undefined;
      setUnresolved(false);
      setError("");
      setPhase(receipt.status === "success"
        ? "Transaction confirmed. Refresh to see the updated name and records."
        : "Transaction reverted. Review the details before trying again.");
      void cache.invalidateQueries({ queryKey: ensIdentityKeys.all });
    } catch { setError("Confirmation is still unavailable. Keep the transaction link and check again shortly."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <div className="space-y-8">
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Wallet and project setup</h2>
      <p>ENS writes use Ethereum Sepolia. Your Arkiv listings remain on Rabdi and public browsing continues independently.</p>
      {!configured && <div role="status" className="space-y-2 rounded-lg bg-amber-500/10 p-4">
        <p>{ensConfigurationError || "Register a Sepolia parent name, set NEXT_PUBLIC_ENS_PARENT_NAME, and restart the app to enable these controls."}</p>
        <a href="https://sepolia.app.ens.domains/" target="_blank" rel="noopener noreferrer" className="underline">Open the Sepolia ENS app</a>
        <p className="text-sm">Use a test wallet and Sepolia test ETH.</p>
      </div>}
      {ensConfig.parentName && <p>Project parent: <strong>{ensConfig.parentName}</strong></p>}
      {!isConnected ? <button className={button} onClick={openConnectModal}>Connect wallet</button> : <>
        {address && <SellerIdentity address={address} profile />}
        {chainId !== ENS_SEPOLIA_CHAIN_ID && <button className={button} disabled={switching || busy} onClick={async () => {
          try { await switchChainAsync({ chainId: ENS_SEPOLIA_CHAIN_ID }); }
          catch { setError("The Sepolia network switch was not completed. Approve it in your wallet when ready."); }
        }}>Switch to Ethereum Sepolia for ENS</button>}
      </>}
    </section>

    <details className="space-y-4 rounded-xl border p-5">
      <summary className="cursor-pointer font-semibold">1. Parent registry setup — project administrator</summary>
      <p className="mt-4 text-sm">After registering the parent in the Sepolia ENS app, use its owner wallet here. If it already has a subregistry, reuse that registry; never replace one serving existing sellers.</p>
      <div className="flex flex-wrap gap-3">
        <button className={button} disabled={disabled} onClick={() => void run(async (client) => {
          const salt = BigInt(`0x${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
          const result = await ensStorefrontService.deployParentRegistry(client, salt);
          setRegistry(result.address);
        })}>Deploy project UserRegistry</button>
        <button className={button} disabled={busy || !configured} onClick={async () => {
          try { setRegistry(await ensStorefrontService.parentRegistry()); setError(""); }
          catch { setError("No matching attached registry was found. Follow the parent setup guide before issuing subnames."); }
        }}>Find existing parent registry</button>
      </div>
      <label className="block text-sm">Parent UserRegistry address<input className={field} value={registry} onChange={(event) => setRegistry(event.target.value)} placeholder="0x…" /></label>
      <button className={button} disabled={disabled || !registry} onClick={() => void run((client) => ensStorefrontService.attachParentRegistry(client, sellerAddress(registry)))}>Attach registry to parent</button>
      <p className="text-xs text-muted-foreground">The registry operator retains parent-level permissions. A seller-owned token does not imply the parent is emancipated or irrevocable.</p>
    </details>

    <section className="space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">2. Issue a seller storefront subname</h2>
      <p className="text-sm">Prepare a resolver controlled by the seller, then let the parent registry’s authorized issuer register the label. Ordinary sellers do not receive permission to register arbitrary subnames.</p>
      <label className="block text-sm">Storefront handle<input className={field} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="alice" maxLength={32} /></label>
      <p className="break-all text-sm">Name: {label || "your-handle"}.{ensConfig.parentName || "your-parent.eth"}</p>
      <label className="block text-sm">Seller wallet (owns the subname and its records)<input className={field} value={seller} onChange={(event) => setSellerDraft(event.target.value)} placeholder="0x…" /></label>
      <button className={button} disabled={disabled || !label || !seller} onClick={() => void run(async (client) => {
        const salt = BigInt(`0x${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
        const result = await ensStorefrontService.deploySellerResolver(client, label, sellerAddress(seller), salt);
        setResolver(result.address);
      })}>Prepare seller resolver and forward address</button>
      <label className="block text-sm">Seller PermissionedResolver address<input className={field} value={resolver} onChange={(event) => setResolver(event.target.value)} placeholder="0x…" /></label>
      <label className="block text-sm">Subname lifetime in days<input className={field} type="number" min={1} max={365} value={days} onChange={(event) => setDays(Number(event.target.value))} /></label>
      <button className={button} disabled={disabled || !label || !resolver || !seller} onClick={() => void run((client) => ensStorefrontService.register(client, { label, seller: sellerAddress(seller), resolver: sellerAddress(resolver), expirationDays: days }))}>Register seller-owned subname</button>
    </section>

    <section className="space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">3. Seller profile and primary name</h2>
      <p className="text-sm">Connect the seller wallet that owns the handle above. Updating records and setting your primary name are separate approvals. A primary name changes this wallet’s Sepolia ENS reverse identity.</p>
      <label className="block text-sm">Avatar HTTPS URL<input className={field} type="url" value={avatar} onChange={(event) => setAvatar(event.target.value)} /></label>
      <label className="block text-sm">Storefront description<textarea className={field} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="block text-sm">Website HTTPS URL<input className={field} type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <div className="flex flex-wrap gap-3">
        <button className={button} disabled={disabled || !label} onClick={() => void run((client) => ensStorefrontService.updateProfile(client, label, { avatar, description, url }))}>Save storefront records</button>
        <button className={button} disabled={disabled || !label} onClick={() => void run((client) => ensStorefrontService.setPrimaryName(client, label))}>Set this storefront as my primary ENS name</button>
      </div>
    </section>

    {(phase || error) && <section aria-label="ENS transaction status" className="space-y-3 rounded-xl border p-5">
      <p role="status" aria-live="polite">{phase}</p>
      {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
      {txHash && <a className="block break-all text-sm underline" href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer">View Sepolia transaction: {txHash}</a>}
      {unresolved && <button className={button} disabled={busy} onClick={() => void checkTransaction()}>Check submitted transaction</button>}
    </section>}
    <p className="text-sm text-muted-foreground">Keep transaction links and deployed registry/resolver addresses before leaving this page. Pending transaction locks are in memory.</p>
  </div>;
}
