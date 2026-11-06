"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import { LISTING_STATUSES, type Listing, type ListingStatus, formatPrice } from "@/domain/listing";
import { useSellerListings } from "@/hooks/use-seller-listings";
import { useListingActions } from "@/hooks/use-listing-actions";
import { useRabdiBlock } from "@/hooks/useListings";
import { ARKIV_RABDI_CHAIN_ID } from "@/lib/arkiv/chain";
import { expirationLabel } from "@/lib/listing-discovery";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";
import { getWalletErrorReason } from "@/lib/wallet/wallet-ui";
import { parseListingPrice } from "@/lib/listing-price-input";
import { ListingImage } from "@/components/listings/ListingImage";
import { ListingGridSkeleton, ListingStatus as StatusBadge } from "@/components/listings/ListingCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const button = "rounded-lg border border-black/20 px-3 py-2 text-sm font-medium hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
const field = "mt-1 w-full rounded-lg border border-black/20 bg-background px-3 py-2";
type ActionDialog = { listing: Listing; kind: "edit" | "extend" | "delete" };

export function SellerDashboard() {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const block = useRabdiBlock();
  // Keep the action lock alive across account switches and dialog closures.
  const actions = useListingActions();
  const query = useSellerListings(isConnected ? address : undefined, actions.isPending);
  const [tab, setTab] = useState<ListingStatus | "all">("all");
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [formError, setFormError] = useState("");
  const onRabdi = chainId === ARKIV_RABDI_CHAIN_ID;
  const owner = address?.toLowerCase();
  const listings = (query.data ?? []).filter((listing) => listing.owner.toLowerCase() === owner && listing.seller.toLowerCase() === owner &&
    (block.data === undefined || listing.expiresAtBlock > block.data));
  const shown = listings.filter((listing) => tab === "all" || listing.status === tab);
  const activeDialog = dialog?.listing.owner.toLowerCase() === owner ? dialog : null;
  const disabled = !onRabdi || actions.isPending;

  function showDialog(listing: Listing, kind: ActionDialog["kind"]) {
    setFormError("");
    setDialog({ listing, kind });
  }

  if (!isConnected || !address) return <div className="space-y-4 rounded-2xl border border-black/10 p-8 text-center"><h2 className="text-xl font-semibold">Connect your seller wallet</h2><p>Connect a wallet to view and manage its listings.</p><button type="button" className={button} onClick={openConnectModal}>Connect wallet</button></div>;

  return <div className="mt-8 space-y-6">
    <p className="break-all font-mono text-xs">Seller: {address}</p>
    {!onRabdi && <div role="alert" className="rounded-xl border border-amber-500/40 p-4"><p>Switch to Arkiv Rabdi to manage listings. You can still view your inventory.</p><button type="button" disabled={switching} className={`${button} mt-3`} onClick={async () => {
      try { await switchChainAsync({ chainId: ARKIV_RABDI_CHAIN_ID }); }
      catch (error) { toast.error(getWalletErrorReason(error)); }
    }}>Switch to Rabdi</button></div>}
    {actions.phase !== "idle" && <div role="status" className="space-y-2 rounded-xl border border-emerald-500/30 p-4">
      <p>{({ signature: "Waiting for wallet confirmation…", pending: "Transaction pending…", verifying: "Confirmed. Checking the public record…", confirmed: "Transaction confirmed.", delayed: "Transaction confirmed. Public indexing is delayed; refresh shortly.", unknown: "Transaction submitted; its confirmation is unknown. Check its status before another action.", error: "The request failed. Check the message and retry when ready." })[actions.phase]}</p>
      {actions.txHash && <a className="block break-all text-sm text-emerald-600 underline" href={`https://rabdi.explorer.arkiv.network/tx/${actions.txHash}`} target="_blank" rel="noopener noreferrer">View transaction: {actions.txHash}</a>}
      {actions.phase === "unknown" && <button type="button" className={button} onClick={() => void actions.checkTransaction()}>Check transaction status</button>}
    </div>}
    <div role="group" aria-label="Listing status" className="flex flex-wrap gap-2">{(["all", ...LISTING_STATUSES] as const).map((status) => <button type="button" key={status} aria-pressed={tab === status} className={`${button} capitalize ${tab === status ? "bg-emerald-600 text-white" : ""}`} onClick={() => setTab(status)}>{status === "all" ? "All Items" : status} ({listings.filter((listing) => status === "all" || listing.status === status).length})</button>)}</div>
    <button type="button" className={button} disabled={query.isFetching || actions.isPending} onClick={() => void query.refetch()}>Refresh listings</button>
    {query.isPending ? <ListingGridSkeleton /> : query.isError ? <div role="alert"><p>{getListingReadErrorMessage(query.error)}</p><button type="button" className={`${button} mt-3`} onClick={() => void query.refetch()}>Retry</button></div> : !shown.length ? <div className="rounded-2xl border border-dashed border-black/20 p-10 text-center"><h2 className="text-xl font-semibold">{listings.length ? "No listings in this status" : "No listings yet"}</h2><Link href="/sell" className="mt-3 inline-block text-emerald-600 underline">Create your first listing</Link></div> : <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{shown.map((listing) => <article key={listing.id} aria-label={listing.title} className="overflow-hidden rounded-2xl border border-black/10">
      <ListingImage src={listing.imageUrl} title={listing.title} />
      <div className="space-y-4 p-5"><div className="flex items-start justify-between gap-2"><Link href={`/listing/${listing.id}`} className="font-semibold hover:underline">{listing.title}</Link><StatusBadge status={listing.status} /></div><p className="text-xl font-bold">{formatPrice(listing.priceMinor, listing.currency)}</p><p className="text-xs">{expirationLabel(listing.expiresAtBlock, block.data)}</p>
        <div className="flex flex-wrap gap-2">{LISTING_STATUSES.filter((status) => status !== listing.status).map((status) => <button type="button" key={status} disabled={disabled} className={`${button} capitalize`} onClick={() => void actions.run(listing, { kind: "status", status })}>Mark as {status}</button>)}
          <button type="button" disabled={disabled} className={button} onClick={() => showDialog(listing, "edit")}>Edit price & description</button><button type="button" disabled={disabled} className={button} onClick={() => showDialog(listing, "extend")}>Extend expiration</button><button type="button" disabled={disabled} className={`${button} text-red-600`} onClick={() => showDialog(listing, "delete")}>Delete listing</button>
        </div>
      </div>
    </article>)}</div>}
    <Dialog open={Boolean(activeDialog)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
      <DialogContent className="bg-background sm:max-w-md"><DialogHeader><DialogTitle>{activeDialog?.kind === "edit" ? "Edit listing" : activeDialog?.kind === "extend" ? "Extend expiration" : "Delete listing"}</DialogTitle><DialogDescription>{activeDialog?.kind === "delete" ? "This permanently removes the entity from active Arkiv queries. Marking an item sold preserves it instead." : activeDialog?.kind === "extend" ? "Add time to the current expiration. This requires a wallet transaction." : "Changes apply only after your wallet transaction succeeds."}</DialogDescription></DialogHeader>
        {activeDialog && <form key={`${activeDialog.listing.id}:${activeDialog.kind}`} className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            const action = activeDialog.kind === "delete" ? { kind: "delete" as const } : activeDialog.kind === "extend" ? { kind: "extend" as const, days: Number(data.get("days")) } : { kind: "edit" as const, changes: { priceMinor: parseListingPrice(String(data.get("price"))), description: String(data.get("description")).trim() } };
            if (await actions.run(activeDialog.listing, action)) setDialog(null);
          } catch (error) { setFormError(error instanceof Error ? error.message : "Check the form and try again."); }
        }}>
          {activeDialog.kind === "edit" && <><label className="block text-sm">Price ({activeDialog.listing.currency})<input className={field} name="price" inputMode="decimal" required defaultValue={`${activeDialog.listing.priceMinor / 100n}.${(activeDialog.listing.priceMinor % 100n).toString().padStart(2, "0")}`} /></label><label className="block text-sm">Description<textarea className={field} name="description" required maxLength={1000} defaultValue={activeDialog.listing.description} rows={5} /></label></>}
          {activeDialog.kind === "extend" && <label className="block text-sm">Additional days<select className={field} name="days" defaultValue="7"><option value="7">+7 days</option><option value="14">+14 days</option><option value="30">+30 days</option></select></label>}
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <button type="button" className={button} onClick={() => setDialog(null)}>Cancel</button><button type="submit" className={`${button} ml-2 ${activeDialog.kind === "delete" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`} disabled={disabled}>{activeDialog.kind === "delete" ? "Permanently delete" : "Confirm changes"}</button>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}
