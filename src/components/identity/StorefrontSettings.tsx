"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, ExternalLink, KeyRound, ShieldAlert, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { isAddress, isAddressEqual, type Address, type Hex } from "viem";
import { createEnsWalletClient } from "@/lib/ens/client";
import { ensConfigurationError, ENS_SEPOLIA_CHAIN_ID } from "@/lib/ens/config";
import { DELEGABLE_TEXT_KEYS, type DelegableTextKey } from "@/lib/ens/contracts";
import { shortenAddress } from "@/lib/wallet/wallet-ui";
import { getEnsDelegationService, type EditCheck } from "@/services/ens-delegation";
import { EnsWriteError } from "@/services/ens-storefront";
import { ensIdentityKeys, useSellerIdentity } from "@/hooks/use-seller-identity";

const card = "space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm";
const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const primary = "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const field = "mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const explorer = (path: string) => `https://sepolia.etherscan.io/${path}`;
type EnsWallet = Awaited<ReturnType<typeof createEnsWalletClient>>;

export const storefrontKeys = {
  records: (name: string) => [...ensIdentityKeys.all, "settings", "records", name] as const,
  delegates: (resolver: string) => [...ensIdentityKeys.all, "settings", "delegates", resolver.toLowerCase()] as const,
};

/** /storefront/settings: inspect an ENS storefront and manage key-scoped delegates (issues #30, #31). */
export function StorefrontSettings() {
  const service = getEnsDelegationService();
  const { address, isConnected, chainId } = useAccount();
  const { data: wallet } = useWalletClient({ chainId: ENS_SEPOLIA_CHAIN_ID });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const cache = useQueryClient();
  const identity = useSellerIdentity(address ?? "");
  const lock = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [chosenName, setChosenName] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<Hex>();
  const [delegateDraft, setDelegateDraft] = useState("");
  const [grantKey, setGrantKey] = useState<DelegableTextKey>("freshmarket.description");
  const [editKey, setEditKey] = useState<DelegableTextKey>("freshmarket.description");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<{ context: string; result: EditCheck } | null>(null);

  // Until the user picks a name, default to the connected wallet's verified primary name.
  const primaryName = identity.data?.name ?? "";
  const name = chosenName || primaryName;
  const draftValue = draft ?? primaryName;

  const records = useQuery({
    queryKey: storefrontKeys.records(name), queryFn: () => service.readStorefront(name),
    enabled: Boolean(name), retry: false, staleTime: 30_000, refetchOnWindowFocus: false,
  });
  const resolver = records.data?.resolver;
  const delegates = useQuery({
    queryKey: storefrontKeys.delegates(resolver ?? ""), queryFn: () => service.listDelegates(resolver!),
    enabled: Boolean(resolver), retry: false, staleTime: 30_000, refetchOnWindowFocus: false,
  });

  // A permission verdict only applies to the wallet, storefront and key it was checked for.
  const checkContext = `${address ?? ""}|${name}|${editKey}`;
  const check = checked?.context === checkContext ? checked.result : null;
  const editId = `${name}|${editKey}`;
  const editValue = edits[editId] ?? records.data?.text[editKey] ?? "";

  const onSepolia = isConnected && chainId === ENS_SEPOLIA_CHAIN_ID && Boolean(wallet);
  const isOwner = Boolean(address && records.data?.owner && isAddressEqual(address, records.data.owner));
  const myKeys = new Set(delegates.data?.filter((d) => address && isAddressEqual(d.account, address)).map((d) => d.key));
  const canWrite = onSepolia && !busy && Boolean(records.data);

  async function run(label: string, action: (client: EnsWallet) => Promise<{ txHash: Hex }>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(""); setTxHash(undefined); setPhase(`${label}: preparing…`);
    try {
      if (!wallet) throw new Error("Connect your wallet on Ethereum Sepolia first");
      const client = await createEnsWalletClient(wallet, {
        onSignatureRequested: () => setPhase(`${label}: confirm in your wallet`),
        onSubmitted: (hash) => { setTxHash(hash); setPhase(`${label}: pending on Sepolia…`); },
      });
      const result = await action(client);
      setTxHash(result.txHash);
      setPhase(`${label}: confirmed and verified onchain`);
      toast.success(`${label} confirmed`, { action: { label: "View tx", onClick: () => window.open(explorer(`tx/${result.txHash}`), "_blank", "noopener") } });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The ENS action was not completed";
      if (cause instanceof EnsWriteError) setTxHash(cause.txHash);
      setPhase(`${label}: not completed`);
      setError(message);
      toast.error(message);
    } finally {
      lock.current = false; setBusy(false);
      // ENS-only namespace: never invalidates Arkiv listing caches.
      void cache.invalidateQueries({ queryKey: ensIdentityKeys.all });
    }
  }

  async function runCheck() {
    if (!address || !name) return;
    const context = checkContext;
    setChecked(null);
    try { setChecked({ context, result: await service.checkTextEdit(name, editKey, address) }); }
    catch (cause) { setChecked({ context, result: { allowed: false, reason: cause instanceof Error ? cause.message : "Permission check failed" } }); }
  }

  const delegateValid = isAddress(delegateDraft);

  return <div className="space-y-6">
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Wallet</h2>
          <p className="text-sm text-muted-foreground">Reading works on any network. Grants, edits and revocations are signed on Ethereum Sepolia; Arkiv listings stay on Rabdi.</p>
        </div>
        {!isConnected ? <button className={primary} onClick={openConnectModal}>Connect wallet</button>
          : chainId !== ENS_SEPOLIA_CHAIN_ID ? <button className={primary} disabled={switching} onClick={async () => {
            try { await switchChainAsync({ chainId: ENS_SEPOLIA_CHAIN_ID }); } catch { toast.error("Network switch was not approved"); }
          }}>Switch to Sepolia</button>
          : <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">Sepolia connected · {address && shortenAddress(address)}</span>}
      </div>
      {ensConfigurationError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{ensConfigurationError}</p>}
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); setChosenName(draftValue.trim().toLowerCase()); }}>
        <label className="flex-1 text-sm font-medium">Storefront ENS name
          <input className={field} value={draftValue} onChange={(event) => setDraft(event.target.value)} placeholder="alice.your-market.eth" spellCheck={false} />
        </label>
        <button className={primary} type="submit" disabled={!draftValue.trim()}>Load storefront</button>
      </form>
      {identity.data && <p className="text-xs text-muted-foreground">Your verified primary name: <strong>{identity.data.name}</strong></p>}
    </section>

    {records.isFetching && !records.data && <div role="status" className={`${card} animate-pulse`}><div className="h-5 w-1/3 rounded bg-muted" /><div className="h-24 rounded bg-muted" /></div>}
    {records.isError && <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm">{records.error instanceof Error ? records.error.message : "Could not read this storefront"}</div>}

    {records.data && <>
      <section className={card} aria-label="Storefront identity">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="break-words text-xl font-bold">{records.data.name}</h2>
          {records.data.verified
            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />Owner = forward address</span>
            : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />Not verified</span>}
          {isOwner && <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">You own this storefront</span>}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Parent / subname">{records.data.name.split(".").slice(1).join(".")} → <strong>{records.data.name.split(".")[0]}</strong></Row>
          <Row label="Token owner">{records.data.owner ? <AddressLink address={records.data.owner} /> : "Not registered"}</Row>
          <Row label="Resolved address (ETH)">{records.data.forwardAddress ? <AddressLink address={records.data.forwardAddress} /> : "None"}</Row>
          <Row label="Resolver (dedicated PermissionedResolver)"><AddressLink address={records.data.resolver} /></Row>
          <Row label="Registry"><AddressLink address={records.data.registry} /></Row>
          <Row label="Expiry">{records.data.expiry ? new Date(Number(records.data.expiry) * 1000).toLocaleDateString() : "—"}</Row>
        </dl>
        <p className="text-xs text-muted-foreground">Read at Sepolia block {records.data.readAtBlock.toLocaleString("en-US")}.</p>
      </section>

      <section className={card} aria-label="Text records">
        <h2 className="text-lg font-semibold">Resolver text records</h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Key</th><th className="px-3 py-2">Value</th></tr></thead>
            <tbody>{DELEGABLE_TEXT_KEYS.map((key) => <tr key={key} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{key}</td>
              <td className="break-words px-3 py-2">{records.data.text[key] || <span className="text-muted-foreground">—</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className={card} aria-label="Delegated managers">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Delegated managers</h2>
          <button className={button} disabled={delegates.isFetching} onClick={() => void delegates.refetch()}>{delegates.isFetching ? "Scanning…" : "Refresh"}</button>
        </div>
        <p className="text-sm text-muted-foreground">Each grant lets one wallet edit one text key on this storefront’s resolver. It does not let the delegate change your address record, your ENS name, or your Arkiv listings.</p>
        {delegates.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">Could not scan delegates: {delegates.error instanceof Error ? delegates.error.message : "RPC error"}</p>}
        {delegates.data && (delegates.data.length === 0
          ? <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No active delegates.</p>
          : <ul className="divide-y divide-border rounded-xl border border-border">{delegates.data.map((delegate) => <li key={`${delegate.account}-${delegate.key}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="flex flex-wrap items-center gap-2"><AddressLink address={delegate.account} /><span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">{delegate.key}</span></span>
            {isOwner && <button className={button} disabled={!canWrite} aria-label={`Revoke ${delegate.key} from ${delegate.account}`}
              onClick={() => void run("Revoke delegate", (client) => service.revokeTextDelegate(client, records.data!.name, delegate.key, delegate.account))}>
              <UserMinus className="h-4 w-4" aria-hidden="true" />Revoke</button>}
          </li>)}</ul>)}

        {isOwner ? (records.data.ownerCanDelegate
          ? <form className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={(event) => {
            event.preventDefault();
            if (!delegateValid) return;
            void run("Grant delegate", (client) => service.grantTextDelegate(client, records.data!.name, grantKey, delegateDraft as Address)).then(() => setDelegateDraft(""));
          }}>
            <label className="text-sm font-medium">Delegate wallet<input className={field} value={delegateDraft} onChange={(event) => setDelegateDraft(event.target.value.trim())} placeholder="0x…" spellCheck={false} aria-invalid={Boolean(delegateDraft) && !delegateValid} /></label>
            <label className="text-sm font-medium">Record key<select className={field} value={grantKey} onChange={(event) => setGrantKey(event.target.value as DelegableTextKey)}>{DELEGABLE_TEXT_KEYS.map((key) => <option key={key} value={key}>{key}</option>)}</select></label>
            <button className={primary} type="submit" disabled={!canWrite || !delegateValid}><UserPlus className="h-4 w-4" aria-hidden="true" />Grant</button>
            {delegateDraft && !delegateValid && <p className="text-xs text-red-700 dark:text-red-300 sm:col-span-3">Enter a valid 0x wallet address.</p>}
          </form>
          : <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm">This resolver was prepared without delegation admin rights. Prepare a new seller resolver on the <Link className="underline" href="/identity">identity setup page</Link> to enable delegation.</p>)
          : <p className="text-xs text-muted-foreground">Connect the storefront owner wallet to grant or revoke delegates.</p>}
      </section>

      <section className={card} aria-label="Edit a record">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5" aria-hidden="true" />Edit a record</h2>
        <p className="text-sm text-muted-foreground">Owners can edit any key; delegates only the keys granted to them. “Check permission” asks the resolver contract directly, so a rejection here is the same revert the chain would produce.</p>
        {address && myKeys.size > 0 && <p className="text-sm">You are a delegate for: {[...myKeys].map((key) => <span key={key} className="mr-1 rounded-full bg-muted px-2 py-0.5 font-mono text-xs">{key}</span>)}</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="text-sm font-medium">Key<select className={field} value={editKey} onChange={(event) => setEditKey(event.target.value as DelegableTextKey)}>{DELEGABLE_TEXT_KEYS.map((key) => <option key={key} value={key}>{key}{myKeys.has(key) ? " (delegated to you)" : ""}</option>)}</select></label>
          <label className="text-sm font-medium">Value<input className={field} value={editValue} maxLength={500} onChange={(event) => { const value = event.target.value; setEdits((current) => ({ ...current, [editId]: value })); }} placeholder={editKey === "url" || editKey === "avatar" ? "https://…" : "Text"} /></label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={!address || busy} onClick={() => void runCheck()}>Check permission</button>
          <button className={primary} disabled={!canWrite} onClick={() => void run(`Update ${editKey}`, async (client) => {
            const result = await service.setStorefrontText(client, records.data!.name, editKey, editValue);
            setEdits((current) => { const next = { ...current }; delete next[editId]; return next; });
            return result;
          })}>Save record</button>
        </div>
        {check && <p role="status" className={`flex items-start gap-2 rounded-xl p-3 text-sm ${check.allowed ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
          {check.allowed ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />}
          <span className="break-words">{check.allowed ? "Authorized: " : "Unauthorized: "}{check.reason}</span>
        </p>}
      </section>
    </>}

    {(phase || error) && <section aria-label="ENS transaction status" className={card}>
      <p role="status" aria-live="polite" className="font-medium">{phase}</p>
      {error && <p role="alert" className="break-words text-sm text-red-700 dark:text-red-300">{error}</p>}
      {txHash && <a className="inline-flex items-center gap-1 break-all text-sm text-emerald-700 underline dark:text-emerald-400" href={explorer(`tx/${txHash}`)} target="_blank" rel="noopener noreferrer">View on Sepolia Etherscan <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
    </section>}
  </div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all">{children}</dd></div>;
}
function AddressLink({ address }: { address: Address }) {
  return <a href={explorer(`address/${address}`)} target="_blank" rel="noopener noreferrer" title={address} className="font-mono text-xs underline decoration-dotted underline-offset-4 hover:text-emerald-700 dark:hover:text-emerald-400">{shortenAddress(address)}</a>;
}
