import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { CONDITION_LABELS, type Listing, displayCity, formatPrice } from "@/domain/listing";
import { categoryLabel } from "../../../shared/categories";
import { shortenAddress } from "@/lib/wallet/wallet-ui";
import { ExpirationCountdown } from "./ExpirationCountdown";
import { ListingImage } from "./ListingImage";

export function ListingStatus({ status }: { status: Listing["status"] }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${status === "available" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : status === "reserved" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{status}</span>;
}

export function ListingCard({ listing, currentBlock }: { listing: Listing; currentBlock?: bigint }) {
  return (
    <Link href={`/listing/${listing.id}`} className="group flex flex-col overflow-hidden rounded-[1.35rem] border border-transparent bg-card transition duration-300 hover:-translate-y-1 hover:border-foreground/15 hover:shadow-[0_20px_50px_rgba(25,27,24,.10)] focus-visible:outline-2 focus-visible:outline-emerald-600">
      <div className="relative">
        <ListingImage src={listing.media[0] ?? ""} title={listing.title} />
        <div className="absolute right-3 top-3 shadow-sm"><ListingStatus status={listing.status} /></div>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2.5 py-1 font-medium">{categoryLabel(listing.categoryPath)}</span><span>{CONDITION_LABELS[listing.condition]}</span></div>
        <h2 className="line-clamp-2 min-h-[2.75rem] font-semibold leading-snug transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{listing.title}</h2>
        <p className="text-2xl font-bold tracking-[-.035em]">{formatPrice(listing.priceMinor)}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin aria-hidden="true" className="h-3.5 w-3.5" />{displayCity(listing.city)}</span>
          <span className="flex items-center gap-1"><Clock aria-hidden="true" className="h-3.5 w-3.5" /><ExpirationCountdown expiresAtBlock={listing.expiresAtBlock} currentBlock={currentBlock} /></span>
        </div>
        <div className="flex items-center justify-between gap-2 border-t editorial-rule pt-3 text-xs"><span title={listing.seller} className="rounded-full bg-muted px-2.5 py-1 font-mono">{shortenAddress(listing.seller)}</span><span className="font-semibold text-emerald-700 transition-transform group-hover:translate-x-1 dark:text-emerald-400">View details →</span></div>
      </div>
    </Link>
  );
}

export function ListingGridSkeleton() {
  return <div role="status" aria-label="Loading listings" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} aria-hidden="true" className="animate-pulse overflow-hidden rounded-[1.35rem] bg-card"><div className="aspect-[4/3] bg-muted" /><div className="space-y-4 p-5"><div className="h-4 w-2/3 rounded bg-muted" /><div className="h-6 w-1/2 rounded bg-muted" /><div className="h-4 rounded bg-muted" /></div></div>)}</div>;
}
