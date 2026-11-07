"use client";

import { PageSkeleton } from "./PageSkeleton";
import { SellerIdentity } from "@/components/identity/SellerIdentity";
import { SellerReviews } from "@/components/reviews/SellerReviews";

import Link from "next/link";
import { Share2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { CONDITION_LABELS, FULFILMENT_LABELS, displayCity, formatPrice } from "@/domain/listing";
import { categoryLabel } from "../../../shared/categories";
import { useListing, useRabdiBlock } from "@/hooks/useListings";
import { isEntityKey, listingExplorerUrl } from "@/lib/listing-discovery";
import { ExpirationCountdown } from "./ExpirationCountdown";
import { ListingGallery } from "./ListingGallery";
import { ListingStatus } from "./ListingCard";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";

export function ListingDetail({ id }: { id: string }) {
  const query = useListing(id);
  const block = useRabdiBlock();
  const back = <Link href="/browse" className="mb-6 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline">← Back to browse</Link>;
  if (!isEntityKey(id)) return <>{back}<h1 className="text-2xl font-bold">Invalid listing link</h1><p className="mt-3">This link does not contain a valid listing ID.</p></>;
  if (query.isPending) return <>{back}<PageSkeleton label="Loading listing" detail /></>;
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

  return <>{back}<article className="grid gap-8 pb-28 lg:pb-0 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
    <div className="space-y-6"><ListingGallery key={listing.id} media={listing.media} title={listing.title} /><section className="space-y-3 rounded-2xl border editorial-rule bg-card/60 p-5"><p className="editorial-kicker text-muted-foreground">Public provenance</p><h2 className="font-semibold">Arkiv testnet record</h2><p className="text-sm">Entity key</p><code className="block break-all text-xs">{listing.id}</code><a href={listingExplorerUrl(listing.id)} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-emerald-700 dark:text-emerald-400 underline">View on Rabdi Explorer ↗</a><p className="text-xs text-muted-foreground">Arkiv Rabdi · Chain 7794095 · freshmarket.listings.v2</p></section></div>
    <div className="space-y-7 lg:sticky lg:top-28 lg:self-start"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-input bg-card px-3 py-1 text-xs">{categoryLabel(listing.categoryPath)}</span><span className="rounded-full border border-input bg-card px-3 py-1 text-xs">{displayCity(listing.city)}</span><span className="rounded-full border border-input bg-card px-3 py-1 text-xs">{CONDITION_LABELS[listing.condition]}</span><span className="rounded-full border border-input bg-card px-3 py-1 text-xs">{FULFILMENT_LABELS[listing.fulfilment]}</span>{listing.visibility === "unlisted" && <span className="rounded-full border border-input bg-card px-3 py-1 text-xs">Unlisted</span>}<ListingStatus status={listing.status} /></div>
      <div className="border-b editorial-rule pb-6"><h1 className="break-words text-4xl font-extrabold tracking-[-.05em] sm:text-5xl">{listing.title}</h1><p className="mt-5 text-4xl font-bold tracking-[-.04em] text-emerald-700 dark:text-emerald-400">{formatPrice(listing.priceMinor)}</p>{(listing.brand || listing.model) && <p className="mt-3 text-sm text-muted-foreground">{[listing.brand && `Brand: ${listing.brand}`, listing.model && `Model: ${listing.model}`].filter(Boolean).join(" · ")}</p>}</div>
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><p className="font-medium"><ExpirationCountdown expiresAtBlock={listing.expiresAtBlock} currentBlock={block.data} /></p><p className="mt-1 text-xs text-muted-foreground">Expires at block {listing.expiresAtBlock.toLocaleString("en-US")}. Time estimates depend on network block speed.</p></div>
      <section><h2 className="mb-2 font-semibold">Description</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{listing.description}</p></section>
      <section className="space-y-3 rounded-2xl bg-card p-5"><p className="editorial-kicker text-muted-foreground">Seller</p><SellerIdentity address={listing.seller} profile /><p className="text-xs text-muted-foreground">Published at Arkiv block {listing.createdAtBlock.toLocaleString("en-US")}</p><SellerReviews seller={listing.seller} listingId={listing.id} /></section>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-lg lg:static lg:border-0 lg:bg-transparent lg:p-0">{listing.status === "available" && listing.priceMinor > 0n
        ? <Link href={`/checkout/${listing.id}`} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#191b18] px-6 py-4 text-base font-semibold text-white hover:bg-black dark:bg-white dark:text-black"><ShoppingBag aria-hidden="true" className="h-5 w-5" />Buy now with USDT</Link>
        : <p className="rounded-xl border border-input p-4 text-sm text-muted-foreground">{listing.status === "available" ? "Free item: arrange pickup with the seller." : `The seller has marked this item ${listing.status}, so it cannot be bought.`}</p>}</div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void share()} className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800"><Share2 aria-hidden="true" className="h-4 w-4" />Share listing</button>
        <button type="button" className="rounded-full border border-input bg-card px-5 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh listing</button>
      </div>
    </div>
  </article></>;
}
