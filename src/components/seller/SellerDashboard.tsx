"use client";

import Link from "next/link";
import { SellerIdentity } from "@/components/identity/SellerIdentity";
import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import {
  LISTING_STATUSES,
  PRICE_CURRENCY,
  PRICE_DECIMALS,
  type Listing,
  type ListingStatus,
  type ListingCondition,
  type ListingFulfilment,
  type ListingVisibility,
  LISTING_CONDITIONS,
  CONDITION_LABELS,
  LISTING_FULFILMENTS,
  FULFILMENT_LABELS,
  formatPrice,
  toPriceInput,
  displayCity,
  toCityKey,
} from "@/domain/listing";
import { type ListingEdits } from "@/services/listing-repository";
import { CATEGORIES } from "../../../shared/categories";
import { resolveImageSource } from "../../../shared/media";
import { useSellerListings } from "@/hooks/use-seller-listings";
import { useListingActions } from "@/hooks/use-listing-actions";
import { useRabdiBlock } from "@/hooks/useListings";
import { ARKIV_RABDI_CHAIN_ID } from "@/lib/arkiv/chain";
import { expirationState } from "@/lib/listing-expiration";
import { ExpirationCountdown } from "@/components/listings/ExpirationCountdown";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";
import { getWalletErrorReason } from "@/lib/wallet/wallet-ui";
import { parseListingPrice } from "@/lib/listing-price-input";
import { ListingImage } from "@/components/listings/ListingImage";
import { ListingGridSkeleton, ListingStatus as StatusBadge } from "@/components/listings/ListingCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const button = "rounded-lg border border-input px-3 py-2 text-sm font-medium hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
const field = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2";
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

  if (!isConnected || !address) return <div className="space-y-4 rounded-2xl border border-border p-8 text-center"><h2 className="text-xl font-semibold">Connect your seller wallet</h2><p>Connect a wallet to view and manage its listings.</p><button type="button" className={button} onClick={openConnectModal}>Connect wallet</button></div>;

  return <div className="mt-8 space-y-6">
    <section aria-label="Seller profile" className="space-y-3"><SellerIdentity address={address} profile /><Link href="/identity" className="block text-sm text-emerald-700 underline">Manage ENS storefront identity</Link></section>
    {!onRabdi && <div role="alert" className="rounded-xl border border-amber-500/40 p-4"><p>Switch to Arkiv Rabdi to manage listings. You can still view your inventory.</p><button type="button" disabled={switching} className={`${button} mt-3`} onClick={async () => {
      try { await switchChainAsync({ chainId: ARKIV_RABDI_CHAIN_ID }); }
      catch (error) { toast.error(getWalletErrorReason(error)); }
    }}>Switch to Rabdi</button></div>}
    {actions.phase !== "idle" && <div role="status" className="space-y-2 rounded-xl border border-emerald-500/30 p-4">
      <p>{({ signature: "Waiting for wallet confirmation…", pending: "Transaction pending…", verifying: "Confirmed. Checking the public record…", confirmed: "Transaction confirmed.", delayed: "Transaction confirmed. Public indexing is delayed; refresh shortly.", unknown: "Transaction submitted; its confirmation is unknown. Check its status before another action.", error: "The request failed. Check the message and retry when ready." })[actions.phase]}</p>
      {actions.txHash && <a className="block break-all text-sm text-emerald-700 dark:text-emerald-400 underline" href={`https://rabdi.explorer.arkiv.network/tx/${actions.txHash}`} target="_blank" rel="noopener noreferrer">View transaction: {actions.txHash}</a>}
      {actions.phase === "unknown" && <button type="button" className={button} onClick={() => void actions.checkTransaction()}>Check transaction status</button>}
    </div>}
    <div role="group" aria-label="Listing status" className="flex flex-wrap gap-2">{(["all", ...LISTING_STATUSES] as const).map((status) => <button type="button" key={status} aria-pressed={tab === status} className={`${button} capitalize ${tab === status ? "bg-emerald-700 text-white" : ""}`} onClick={() => setTab(status)}>{status === "all" ? "All Items" : status} ({listings.filter((listing) => status === "all" || listing.status === status).length})</button>)}</div>
    <button type="button" className={button} disabled={query.isFetching || actions.isPending} onClick={() => void query.refetch()}>Refresh listings</button>
    {query.isPending ? <ListingGridSkeleton /> : query.isError ? <div role="alert"><p>{getListingReadErrorMessage(query.error)}</p><button type="button" className={`${button} mt-3`} onClick={() => void query.refetch()}>Retry</button></div> : !shown.length ? <div className="rounded-2xl border border-dashed border-input p-10 text-center"><h2 className="text-xl font-semibold">{listings.length ? "No listings in this status" : "No listings yet"}</h2><Link href="/sell" className="mt-3 inline-block text-emerald-700 dark:text-emerald-400 underline">Create your first listing</Link></div> : <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{shown.map((listing) => <article key={listing.id} aria-label={listing.title} className="overflow-hidden rounded-2xl border border-border">
      <ListingImage src={listing.media[0] ?? ""} title={listing.title} />
      <div className="space-y-4 p-5"><div className="flex items-start justify-between gap-2"><Link href={`/listing/${listing.id}`} className="font-semibold hover:underline">{listing.title}</Link><StatusBadge status={listing.status} /></div><p className="text-xl font-bold">{formatPrice(listing.priceMinor)}</p>{listing.visibility === "unlisted" && <p className="text-xs text-muted-foreground">Unlisted: only people with the link see it in FreshMarket.</p>}<p className="text-xs"><ExpirationCountdown expiresAtBlock={listing.expiresAtBlock} currentBlock={block.data} /></p>
        <div className="flex flex-wrap gap-2">{LISTING_STATUSES.filter((status) => status !== listing.status).map((status) => <button type="button" key={status} disabled={disabled} className={`${button} capitalize`} onClick={() => void actions.run(listing, { kind: "status", status })}>Mark as {status}</button>)}
          <button type="button" disabled={disabled} className={button} aria-label="Edit price & description" onClick={() => showDialog(listing, "edit")}>Edit listing</button><button type="button" disabled={disabled} className={button} onClick={() => showDialog(listing, "extend")}>{expirationState(listing.expiresAtBlock, block.data).nearExpiry ? "Renew listing" : "Extend expiration"}</button><button type="button" disabled={disabled} className={`${button} text-red-600`} onClick={() => showDialog(listing, "delete")}>Delete listing</button>
        </div>
      </div>
    </article>)}</div>}
    <Dialog open={Boolean(activeDialog)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
      <DialogContent className="bg-background sm:max-w-xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{activeDialog?.kind === "edit" ? "Edit listing" : activeDialog?.kind === "extend" ? "Extend expiration" : "Delete listing"}</DialogTitle><DialogDescription>{activeDialog?.kind === "delete" ? "This permanently removes the entity from active Arkiv queries. Marking an item sold preserves it instead." : activeDialog?.kind === "extend" ? "Add time to the current expiration. This requires a wallet transaction." : "Changes apply only after your wallet transaction succeeds."}</DialogDescription></DialogHeader>
        {activeDialog && <form key={`${activeDialog.listing.id}:${activeDialog.kind}`} className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            let action;
            if (activeDialog.kind === "delete") {
              action = { kind: "delete" as const };
            } else if (activeDialog.kind === "extend") {
              action = { kind: "extend" as const, days: Number(data.get("days")) };
            } else {
              const changes: ListingEdits = {};
              const newPriceMinor = parseListingPrice(String(data.get("price")));
              if (newPriceMinor !== activeDialog.listing.priceMinor) changes.priceMinor = newPriceMinor;

              const newDescription = String(data.get("description") ?? "").trim();
              if (newDescription !== activeDialog.listing.description) changes.description = newDescription;

              const newTitle = String(data.get("title") ?? "").trim();
              if (newTitle && newTitle !== activeDialog.listing.title) changes.title = newTitle;

              const newCategory = String(data.get("categoryPath") ?? "").trim();
              if (newCategory && newCategory !== activeDialog.listing.categoryPath) changes.categoryPath = newCategory;

              const newCity = String(data.get("city") ?? "").trim();
              if (newCity && toCityKey(newCity) !== activeDialog.listing.city) changes.city = newCity;

              const newBrand = String(data.get("brand") ?? "").trim();
              if (newBrand !== (activeDialog.listing.brand ?? "")) changes.brand = newBrand;

              const newModel = String(data.get("model") ?? "").trim();
              if (newModel !== (activeDialog.listing.model ?? "")) changes.model = newModel;

              const newCondition = String(data.get("condition") ?? "") as ListingCondition;
              if (newCondition && newCondition !== activeDialog.listing.condition) changes.condition = newCondition;

              const newFulfilment = String(data.get("fulfilment") ?? "") as ListingFulfilment;
              if (newFulfilment && newFulfilment !== activeDialog.listing.fulfilment) changes.fulfilment = newFulfilment;

              const newVisibility = String(data.get("visibility") ?? "") as ListingVisibility;
              if (newVisibility && newVisibility !== activeDialog.listing.visibility) changes.visibility = newVisibility;

              const newImageUrl = String(data.get("imageUrl") ?? "").trim();
              if (newImageUrl && newImageUrl !== (activeDialog.listing.media[0] ?? "")) {
                if (!resolveImageSource(newImageUrl)) {
                  throw new Error("Image must be an HTTPS URL without credentials or a public bzz:// reference");
                }
                changes.media = [newImageUrl];
              }

              if (Object.keys(changes).length === 0) {
                setDialog(null);
                return;
              }
              action = { kind: "edit" as const, changes };
            }
            if (await actions.run(activeDialog.listing, action)) setDialog(null);
          } catch (error) { setFormError(error instanceof Error ? error.message : "Check the form and try again."); }
        }}>
          {activeDialog.kind === "edit" && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-sm font-medium" htmlFor="edit-title">Title</label>
                <input id="edit-title" className={field} name="title" required maxLength={80} defaultValue={activeDialog.listing.title} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium" htmlFor="edit-category">Category</label>
                  <select id="edit-category" className={field} name="categoryPath" required defaultValue={activeDialog.listing.categoryPath}>
                    {CATEGORIES.map((cat) => (
                      <option key={cat.path} value={cat.path}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium" htmlFor="edit-price">
                    Price ({PRICE_CURRENCY}, up to {PRICE_DECIMALS} decimals)
                  </label>
                  <input id="edit-price" className={field} name="price" inputMode="decimal" required defaultValue={toPriceInput(activeDialog.listing.priceMinor)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium" htmlFor="edit-city">City</label>
                  <input id="edit-city" className={field} name="city" required maxLength={50} defaultValue={displayCity(activeDialog.listing.city)} />
                </div>

                <div>
                  <label className="block text-sm font-medium" htmlFor="edit-condition">Condition</label>
                  <select id="edit-condition" className={field} name="condition" defaultValue={activeDialog.listing.condition}>
                    {LISTING_CONDITIONS.map((c) => (
                      <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium" htmlFor="edit-brand">Brand (Optional)</label>
                  <input id="edit-brand" className={field} name="brand" maxLength={64} defaultValue={activeDialog.listing.brand} placeholder="e.g. Lenovo" />
                </div>

                <div>
                  <label className="block text-sm font-medium" htmlFor="edit-model">Model (Optional)</label>
                  <input id="edit-model" className={field} name="model" maxLength={64} defaultValue={activeDialog.listing.model} placeholder="e.g. ThinkPad T14" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium" htmlFor="edit-fulfilment">Delivery</label>
                  <select id="edit-fulfilment" className={field} name="fulfilment" defaultValue={activeDialog.listing.fulfilment}>
                    {LISTING_FULFILMENTS.map((f) => (
                      <option key={f} value={f}>{FULFILMENT_LABELS[f]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium" htmlFor="edit-visibility">Visibility</label>
                  <select id="edit-visibility" className={field} name="visibility" defaultValue={activeDialog.listing.visibility}>
                    <option value="public">Public (in browse)</option>
                    <option value="unlisted">Unlisted (link only)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium" htmlFor="edit-image">Photo URL or Swarm reference</label>
                <input id="edit-image" className={field} name="imageUrl" required defaultValue={activeDialog.listing.media[0] ?? ""} placeholder="https://... or bzz://..." />
              </div>

              <div>
                <label className="block text-sm font-medium" htmlFor="edit-description">Description</label>
                <textarea id="edit-description" className={field} name="description" required maxLength={1000} defaultValue={activeDialog.listing.description} rows={4} />
              </div>
            </div>
          )}
          {activeDialog.kind === "extend" && <label className="block text-sm">Additional days<select className={field} name="days" defaultValue="7"><option value="7">+7 days</option><option value="14">+14 days</option><option value="30">+30 days</option></select></label>}
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <button type="button" className={button} onClick={() => setDialog(null)}>Cancel</button><button type="submit" className={`${button} ml-2 ${activeDialog.kind === "delete" ? "bg-red-600 text-white" : "bg-emerald-700 text-white"}`} disabled={disabled}>{activeDialog.kind === "delete" ? "Permanently delete" : "Confirm changes"}</button>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}
