"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LISTING_CATEGORIES } from "@/domain/listing";
import { discoveryQuery, parseDiscoveryFilters, type DiscoveryFilters, type ListingSort } from "@/lib/listing-discovery";

const field = "w-full rounded-lg border border-black/20 bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-600";

export function ListingFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const filters = parseDiscoveryFilters(params);
  function update(patch: Partial<DiscoveryFilters>) {
    const query = discoveryQuery({ ...filters, ...patch });
    router.push(query ? `/browse?${query}` : "/browse", { scroll: false });
  }
  const active = Boolean(filters.category || filters.city || filters.q || filters.sort !== "newest");
  const categories = [...LISTING_CATEGORIES] as string[];
  if (filters.category && !categories.includes(filters.category)) categories.push(filters.category);

  return (
    <section aria-label="Filter listings" className="space-y-5 rounded-2xl border border-black/10 p-4 sm:p-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        {["", ...categories].map((category) => <button key={category} type="button" aria-pressed={filters.category === category} onClick={() => update({ category })}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${filters.category === category ? "border-emerald-600 bg-emerald-700 text-white" : "border-black/15 hover:border-emerald-600"}`}>{category || "All Items"}</button>)}
      </div>
      <form key={`${filters.q}:${filters.city}`} onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        update({ q: String(data.get("q") ?? ""), city: String(data.get("city") ?? "") });
      }} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto_1.3fr]">
        <label className="space-y-1 text-sm font-medium">Search title<input className={field} type="search" name="q" defaultValue={filters.q} placeholder="What are you looking for?" maxLength={128} /></label>
        <label className="space-y-1 text-sm font-medium">City (exact match)<input className={field} name="city" defaultValue={filters.city} placeholder="e.g. Mumbai" maxLength={128} /></label>
        <button className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800" type="submit">Search</button>
        <label className="space-y-1 text-sm font-medium">Sort by<select className={field} value={filters.sort} onChange={(event) => update({ sort: event.target.value as ListingSort })}>
          <option value="newest">Newest</option><option value="price-asc">Price: Lowest to Highest</option><option value="price-desc">Price: Highest to Lowest</option>
        </select></label>
      </form>
      {active && <button type="button" className="text-sm font-medium text-emerald-700 dark:text-emerald-400 underline underline-offset-4" onClick={() => router.push("/browse", { scroll: false })}>Clear all filters</button>}
      {filters.sort !== "newest" && <p className="text-xs text-muted-foreground">Prices are sorted within each currency. No currency conversion is applied.</p>}
    </section>
  );
}
