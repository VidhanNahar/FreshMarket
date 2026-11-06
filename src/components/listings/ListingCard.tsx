import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { type Listing, formatPrice } from "@/domain/listing";
import { shortenAddress } from "@/lib/wallet/wallet-ui";
import { expirationLabel } from "@/lib/listing-discovery";
import { ListingImage } from "./ListingImage";

export function ListingStatus({ status }: { status: Listing["status"] }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${status === "available" ? "bg-emerald-100 text-emerald-800" : status === "reserved" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

export function ListingCard({ listing, currentBlock }: { listing: Listing; currentBlock?: bigint }) {
  return (
    <Link href={`/listing/${listing.id}`} className="group overflow-hidden rounded-2xl border border-black/10 bg-background shadow-sm transition hover:-translate-y-1 hover:shadow-md focus-visible:outline-2 focus-visible:outline-emerald-600">
      <ListingImage src={listing.imageUrl} title={listing.title} />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full border border-black/10 px-2 py-1 text-xs">{listing.category}</span><ListingStatus status={listing.status} /></div>
        <h2 className="line-clamp-2 font-semibold group-hover:text-emerald-600">{listing.title}</h2>
        <p className="text-xl font-bold">{formatPrice(listing.priceMinor, listing.currency)}</p>
        <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="h-3.5 w-3.5" />{listing.city}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock aria-hidden="true" className="h-3.5 w-3.5" />{expirationLabel(listing.expiresAtBlock, currentBlock)}</p>
        <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-3 text-xs"><span title={listing.seller} className="rounded bg-black/5 px-2 py-1 font-mono">{shortenAddress(listing.seller)}</span><span className="font-semibold text-emerald-600">View details →</span></div>
      </div>
    </Link>
  );
}

export function ListingGridSkeleton() {
  return <div role="status" aria-label="Loading listings" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} aria-hidden="true" className="animate-pulse overflow-hidden rounded-2xl border border-black/10"><div className="aspect-[4/3] bg-black/10" /><div className="space-y-4 p-4"><div className="h-4 w-2/3 rounded bg-black/10" /><div className="h-6 w-1/2 rounded bg-black/10" /><div className="h-4 rounded bg-black/10" /></div></div>)}</div>;
}
