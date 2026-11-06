"use client";

import { useSearchParams } from "next/navigation";
import { useListings } from "@/hooks/useListings";
import { parseDiscoveryFilters } from "@/lib/listing-discovery";
import { ListingCard, ListingGridSkeleton } from "./ListingCard";
import { ListingFilters } from "./ListingFilters";

export function Marketplace() {
  const filters = parseDiscoveryFilters(useSearchParams());
  const query = useListings(filters);
  return <div className="mt-8 space-y-8">
    <ListingFilters />
    {query.isPending ? <ListingGridSkeleton /> : query.isError ? (
      <div role="alert" className="rounded-2xl border border-amber-500/40 p-8 text-center"><h2 className="text-lg font-semibold">We couldn’t load listings</h2><p className="mt-2 text-sm text-muted-foreground">Arkiv may be temporarily unavailable or rate limited. Please try again.</p><button type="button" className="mt-4 rounded-lg bg-emerald-600 px-5 py-2 text-white" onClick={() => void query.refetch()}>Try again</button></div>
    ) : <>
      <p role="status" className="text-sm text-muted-foreground">{query.data.length} {query.data.length === 1 ? "listing" : "listings"} found{query.isFetching ? " · Refreshing…" : ""}</p>
      {query.data.length ? <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{query.data.map((listing) => <ListingCard key={listing.id} listing={listing} currentBlock={query.currentBlock} />)}</div> : <div className="rounded-2xl border border-dashed border-black/20 px-6 py-16 text-center"><h2 className="text-xl font-semibold">No listings found</h2><p className="mt-2 text-sm text-muted-foreground">Try another category or city, clear your search, or check back for new items.</p></div>}
    </>}
  </div>;
}
