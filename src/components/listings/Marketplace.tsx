"use client";

import { useSearchParams } from "next/navigation";
import { useListings } from "@/hooks/useListings";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";
import { parseDiscoveryFilters } from "@/lib/listing-discovery";
import { ListingCard, ListingGridSkeleton } from "./ListingCard";
import { ListingFilters } from "./ListingFilters";
import { categoryLabel } from "../../../shared/categories";

export function Marketplace() {
  const filters = parseDiscoveryFilters(useSearchParams());
  const query = useListings(filters);
  return <div className="mt-8 space-y-8">
    <ListingFilters />
    {query.isError && query.hasData && <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">Refresh failed. Showing the last successful results. <button type="button" className="font-medium underline underline-offset-4" onClick={() => void query.refetch()}>Retry refresh</button></div>}
    {query.isPending ? <ListingGridSkeleton /> : query.isError && !query.hasData ? (
      <div role="alert" className="rounded-2xl border border-amber-500/40 p-8 text-center"><h2 className="text-lg font-semibold">We couldn’t load listings</h2><p className="mt-2 text-sm text-muted-foreground">{getListingReadErrorMessage(query.error)}</p><button type="button" className="mt-4 rounded-lg bg-emerald-700 px-5 py-2 text-white" onClick={() => void query.refetch()}>Try again</button></div>
    ) : <>
      {query.resolved.corrected && query.resolved.recognized.length > 0 && <p className="text-sm">Showing results for <strong>{query.resolved.recognized.join(" ")}</strong></p>}
      {query.fallbackCategory && <p className="text-sm">No exact matches nearby. Showing other items in <strong>{categoryLabel(query.fallbackCategory)}</strong>.</p>}
      <p role="status" className="text-sm text-muted-foreground">{query.data.length} {query.data.length === 1 ? "listing" : "listings"} found{query.isFetching ? " · Refreshing…" : ""}</p>
      {query.data.length ? <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{query.data.map((listing) => <ListingCard key={listing.id} listing={listing} currentBlock={query.currentBlock} />)}</div> : <div className="rounded-2xl border border-dashed border-input px-6 py-16 text-center"><h2 className="text-xl font-semibold">No listings found</h2><p className="mt-2 text-sm text-muted-foreground">Try another category or city, clear your search, or check back for new items.</p></div>}
    </>}
  </div>;
}
