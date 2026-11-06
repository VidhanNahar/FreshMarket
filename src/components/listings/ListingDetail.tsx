"use client";

import { SellerIdentity } from "@/components/identity/SellerIdentity";

import Link from "next/link";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { CONDITION_LABELS, FULFILMENT_LABELS, displayCity, formatPrice } from "@/domain/listing";
import { categoryLabel } from "../../../shared/categories";
import { useListing, useRabdiBlock } from "@/hooks/useListings";
import { isEntityKey, listingExplorerUrl } from "@/lib/listing-discovery";
import { ExpirationCountdown } from "./ExpirationCountdown";
import { ListingImage } from "./ListingImage";
import { ListingStatus } from "./ListingCard";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";

export function ListingDetail({ id }: { id: string }) {
  const query = useListing(id);
  const block = useRabdiBlock();
  const back = <Link href="/browse" className="mb-6 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline">← Back to browse</Link>;
  if (!isEntityKey(id)) return <>{back}<h1 className="text-2xl font-bold">Invalid listing link</h1><p className="mt-3">This link does not contain a valid listing ID.</p></>;
  if (query.isPending) return <>{back}<div role="status" aria-label="Loading listing" className="grid animate-pulse gap-8 md:grid-cols-2"><div className="aspect-[4/3] rounded-2xl bg-muted" /><div className="space-y-6"><div className="h-8 rounded bg-muted" /><div className="h-12 w-1/2 rounded bg-muted" /><div className="h-40 rounded bg-muted" /></div></div></>;
  if (query.isError) return <>{back}<div role="alert"><h1 className="text-2xl font-bold">We couldn’t load this listing</h1><p className="mt-3">{getListingReadErrorMessage(query.error)}</p><button type="button" className="mt-4 rounded-lg bg-emerald-700 px-5 py-2 text-white" onClick={() => void query.refetch()}>Try again</button></div></>;
  const listing = query.data;
  if (!listing || (block.data !== undefined && listing.expiresAtBlock <= block.data)) return <>{back}<h1 className="text-2xl font-bold">Listing no longer available</h1><p className="mt-3">It may have expired, been removed, or not yet become publicly readable.</p><button type="button" className="mt-4 rounded-lg border px-4 py-2" disabled={query.isFetching} onClick={() => void query.refetch()}>Check again</button></>;

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: listing!.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Listing link copied");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("Could not share the listing. Copy the URL from your address bar.");
    }
  }

  return <>{back}<article className="grid gap-8 md:grid-cols-2 md:gap-10">
    <div className="space-y-6"><ListingImage src={listing.media[0] ?? ""} title={listing.title} full />{listing.media.length > 1 && <div className="grid grid-cols-4 gap-2">{listing.media.slice(1).map((reference) => <ListingImage key={reference} src={reference} title={listing.title} />)}</div>}<section className="space-y-3 rounded-2xl border border-border p-5"><h2 className="font-semibold">Arkiv testnet record</h2><p className="text-sm">Entity key</p><code className="block break-all text-xs">{listing.id}</code><a href={listingExplorerUrl(listing.id)} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-emerald-700 dark:text-emerald-400 underline">View on Rabdi Explorer ↗</a><p className="text-xs text-muted-foreground">Arkiv Rabdi · Chain 7794095 · freshmarket.listings.v2</p></section></div>
    <div className="space-y-6"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-input px-3 py-1 text-xs">{categoryLabel(listing.categoryPath)}</span><span className="rounded-full border border-input px-3 py-1 text-xs">{displayCity(listing.city)}</span><span className="rounded-full border border-input px-3 py-1 text-xs">{CONDITION_LABELS[listing.condition]}</span><span className="rounded-full border border-input px-3 py-1 text-xs">{FULFILMENT_LABELS[listing.fulfilment]}</span>{listing.visibility === "unlisted" && <span className="rounded-full border border-input px-3 py-1 text-xs">Unlisted</span>}<ListingStatus status={listing.status} /></div>
      <h1 className="break-words text-3xl font-extrabold tracking-tight">{listing.title}</h1><p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{formatPrice(listing.priceMinor)}</p>{(listing.brand || listing.model) && <p className="text-sm text-muted-foreground">{[listing.brand && `Brand: ${listing.brand}`, listing.model && `Model: ${listing.model}`].filter(Boolean).join(" · ")}</p>}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><p className="font-medium"><ExpirationCountdown expiresAtBlock={listing.expiresAtBlock} currentBlock={block.data} /></p><p className="mt-1 text-xs text-muted-foreground">Expires at block {listing.expiresAtBlock.toLocaleString("en-US")}. Time estimates depend on network block speed.</p></div>
      <section><h2 className="mb-2 font-semibold">Description</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{listing.description}</p></section>
      <section className="space-y-3 border-t border-border pt-5"><h2 className="font-semibold">Seller</h2><SellerIdentity address={listing.seller} profile /><p className="text-xs text-muted-foreground">Published at Arkiv block {listing.createdAtBlock.toLocaleString("en-US")}</p></section>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void share()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"><Share2 aria-hidden="true" className="h-4 w-4" />Share listing</button>
        <button type="button" className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh listing</button>
      </div>
    </div>
  </article></>;
}
