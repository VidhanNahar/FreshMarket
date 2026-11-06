"use client";

import Form from "next/form";
import { useState } from "react";
import { SlidersHorizontal, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSearchParams } from "next/navigation";
import { useListings } from "@/hooks/useListings";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";
import { parseDiscoveryFilters } from "@/lib/listing-discovery";
import { ListingCard, ListingGridSkeleton } from "./ListingCard";
import { ListingFilters } from "./ListingFilters";
import { categoryLabel } from "../../../shared/categories";

export function Marketplace() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = parseDiscoveryFilters(useSearchParams());
  const query = useListings(filters);
  return <div className="mt-7 space-y-7">
    <div className="sticky top-[4.5rem] z-20 -mx-1 flex items-center gap-3 border-b editorial-rule bg-background/95 px-1 py-4 backdrop-blur-lg">
      <Form action="/browse" className="flex flex-1 items-center gap-3 rounded-xl border border-input bg-card px-4 py-2.5">
        <Search aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
        <input key={filters.q} aria-label="Search marketplace" name="q" type="search" defaultValue={filters.q} placeholder="Find your next great thing" className="w-full bg-transparent text-sm outline-none" />
        {Object.entries(filters).filter(([key, value]) => key !== "q" && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <button type="submit" className="text-sm font-semibold text-primary">Search</button>
      </Form>
      <button type="button" onClick={() => setFiltersOpen(true)} className="flex items-center gap-2 rounded-xl border border-input bg-card px-4 py-3 text-sm font-semibold lg:hidden"><SlidersHorizontal aria-hidden="true" className="h-4 w-4" />Filters</button>
    </div>
    <div className="grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside aria-label="Catalogue filters" className="hidden lg:sticky lg:top-44 lg:block"><details open><summary className="mb-5 cursor-pointer text-sm font-semibold">Refine your finds</summary><ListingFilters /></details></aside>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}><DialogContent className="top-auto bottom-0 max-h-[88dvh] w-full max-w-full translate-y-0 rounded-b-none rounded-t-2xl p-6 sm:max-w-lg"><DialogHeader><DialogTitle>Filter your finds</DialogTitle><DialogDescription>Choose a category, city, price or condition.</DialogDescription></DialogHeader><ListingFilters /><button type="button" onClick={() => setFiltersOpen(false)} className="sticky bottom-0 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">Show results</button></DialogContent></Dialog>
      <div className="space-y-6">
    {query.isError && query.hasData && <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">Refresh failed. Showing the last successful results. <button type="button" className="font-medium underline underline-offset-4" onClick={() => void query.refetch()}>Retry refresh</button></div>}
    {query.isPending ? <ListingGridSkeleton /> : query.isError && !query.hasData ? (
      <div role="alert" className="rounded-2xl border border-amber-500/40 p-8 text-center"><h2 className="text-lg font-semibold">We couldn’t load listings</h2><p className="mt-2 text-sm text-muted-foreground">{getListingReadErrorMessage(query.error)}</p><button type="button" className="mt-4 rounded-lg bg-emerald-700 px-5 py-2 text-white" onClick={() => void query.refetch()}>Try again</button></div>
    ) : <>
      {query.resolved.corrected && query.resolved.recognized.length > 0 && <p className="text-sm">Showing results for <strong>{query.resolved.recognized.join(" ")}</strong></p>}
      {query.fallbackCategory && <p className="text-sm">No exact matches nearby. Showing other items in <strong>{categoryLabel(query.fallbackCategory)}</strong>.</p>}
      {query.truncated && <p className="rounded-lg border border-amber-500/40 p-3 text-sm">Too many listings match to load them all. Showing the first part only. Pick a category or city to see everything relevant.</p>}
      <div className="flex items-center justify-between border-b editorial-rule pb-3"><p role="status" className="text-sm font-medium">{query.data.length} {query.data.length === 1 ? "listing" : "listings"}<span className="font-normal text-muted-foreground">{query.isFetching ? " · Refreshing…" : " found"}</span></p><span className="editorial-kicker text-muted-foreground">Live catalogue</span></div>
      {query.data.length ? <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{query.data.map((listing) => <ListingCard key={listing.id} listing={listing} currentBlock={query.currentBlock} />)}</div> : <div className="rounded-3xl border border-dashed border-input px-6 py-20 text-center"><h2 className="text-2xl font-semibold tracking-tight">No listings found</h2><p className="mt-2 text-sm text-muted-foreground">Try another category or city, clear your search, or check back for new items.</p></div>}
    </>}
      </div>
    </div>
  </div>;
}
