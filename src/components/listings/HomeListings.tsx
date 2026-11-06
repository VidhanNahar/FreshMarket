"use client";

import Link from "next/link";
import { useListings } from "@/hooks/useListings";
import { parseDiscoveryFilters } from "@/lib/listing-discovery";
import { ListingCard, ListingGridSkeleton } from "./ListingCard";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";

const filters = parseDiscoveryFilters(new URLSearchParams());

export function HomeListings() {
  const query = useListings(filters);
  return <section className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 lg:px-12 lg:py-20" aria-labelledby="recent-listings">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><p className="editorial-kicker text-primary">Fresh on the market</p><h2 id="recent-listings" className="mt-3 text-3xl font-semibold tracking-[-.045em] sm:text-5xl">Your next great find.</h2></div>
      <Link href="/browse" className="rounded-full border border-input px-5 py-3 text-sm font-semibold transition hover:bg-muted">Explore all listings ↗</Link>
    </div>
    {query.isPending ? <ListingGridSkeleton /> : query.isError && !query.hasData ? <div role="alert" className="rounded-2xl border border-border p-8"><p>{getListingReadErrorMessage(query.error)}</p><button type="button" onClick={() => void query.refetch()} className="mt-3 font-semibold text-primary underline">Try again</button></div> : <>
      {query.isError && <p role="alert" className="mb-4 text-sm text-muted-foreground">Refresh failed. Showing the last successful listings. <button type="button" onClick={() => void query.refetch()} className="underline">Retry</button></p>}
      {query.data.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{query.data.slice(0, 8).map(listing => <ListingCard key={listing.id} listing={listing} currentBlock={query.currentBlock} />)}</div> : <div className="rounded-2xl border border-dashed border-input bg-card px-6 py-14 text-center"><h3 className="text-xl font-semibold">Good things start with a first listing.</h3><p className="mt-2 text-sm text-muted-foreground">Have something worth passing on? Give it a place here.</p><Link href="/sell" className="mt-5 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">List an item</Link></div>}
    </>}
  </section>;
}
