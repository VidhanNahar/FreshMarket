"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CONDITION_LABELS, FULFILMENT_LABELS, LISTING_CONDITIONS, LISTING_FULFILMENTS, PRICE_CURRENCY } from "@/domain/listing";
import { discoveryQuery, parseDiscoveryFilters, type DiscoveryFilters, type ListingSort } from "@/lib/listing-discovery";
import { CATEGORIES } from "../../../shared/categories";

const field = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-600";
const TOP_LEVEL = CATEGORIES.filter((node) => !node.path.includes("/"));

export function ListingFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const filters = parseDiscoveryFilters(params);
  function update(patch: Partial<DiscoveryFilters>) {
    const query = discoveryQuery({ ...filters, ...patch });
    router.push(query ? `/browse?${query}` : "/browse", { scroll: false });
  }
  const active = Boolean(discoveryQuery(filters));
  const topLevel = filters.category.split("/")[0];

  return (
    <section aria-label="Filter listings" className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        {[{ path: "", label: "All Items" }, ...TOP_LEVEL].map((node) => <button key={node.path} type="button" aria-pressed={topLevel === node.path} onClick={() => update({ category: node.path })}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${topLevel === node.path ? "border-emerald-600 bg-emerald-700 text-white" : "border-input hover:border-emerald-600"}`}>{node.label}</button>)}
      </div>
      {topLevel && <label className="block max-w-sm space-y-1 text-sm font-medium">Subcategory<select className={field} value={filters.category} onChange={(event) => update({ category: event.target.value })}>
        {CATEGORIES.filter((node) => node.path === topLevel || node.path.startsWith(`${topLevel}/`)).map((node) =>
          <option key={node.path} value={node.path}>{`${"— ".repeat(node.path.split("/").length - 1)}${node.path === topLevel ? `All ${node.label}` : node.label}`}</option>)}
      </select></label>}
      <form key={discoveryQuery(filters)} onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const text = (name: string) => String(data.get(name) ?? "");
        update({ q: text("q"), city: text("city"), minPrice: text("minPrice"), maxPrice: text("maxPrice") });
      }} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_0.7fr_0.7fr_auto]">
        <label className="space-y-1 text-sm font-medium">Search<input className={field} type="search" name="q" defaultValue={filters.q} placeholder="e.g. dog toy, iphone 13, latpop" maxLength={128} /></label>
        <label className="space-y-1 text-sm font-medium">City<input className={field} name="city" defaultValue={filters.city} placeholder="e.g. Mumbai" maxLength={128} /></label>
        <label className="space-y-1 text-sm font-medium">Min {PRICE_CURRENCY}<input className={field} name="minPrice" inputMode="decimal" defaultValue={filters.minPrice} placeholder="0" /></label>
        <label className="space-y-1 text-sm font-medium">Max {PRICE_CURRENCY}<input className={field} name="maxPrice" inputMode="decimal" defaultValue={filters.maxPrice} placeholder="Any" /></label>
        <button className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800" type="submit">Search</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">Condition<select className={field} value={filters.condition} onChange={(event) => update({ condition: event.target.value as DiscoveryFilters["condition"] })}>
          <option value="">Any condition</option>{LISTING_CONDITIONS.map((condition) => <option key={condition} value={condition}>{CONDITION_LABELS[condition]}</option>)}
        </select></label>
        <label className="space-y-1 text-sm font-medium">Delivery<select className={field} value={filters.fulfilment} onChange={(event) => update({ fulfilment: event.target.value as DiscoveryFilters["fulfilment"] })}>
          <option value="">Pickup or shipping</option>{LISTING_FULFILMENTS.map((fulfilment) => <option key={fulfilment} value={fulfilment}>{FULFILMENT_LABELS[fulfilment]}</option>)}
        </select></label>
        <label className="space-y-1 text-sm font-medium">Sort by<select className={field} value={filters.sort} onChange={(event) => update({ sort: event.target.value as ListingSort })}>
          <option value="newest">Best match, then newest</option><option value="price-asc">Price: Lowest to Highest</option><option value="price-desc">Price: Highest to Lowest</option>
        </select></label>
      </div>
      {active && <button type="button" className="text-sm font-medium text-emerald-700 dark:text-emerald-400 underline underline-offset-4" onClick={() => router.push("/browse", { scroll: false })}>Clear all filters</button>}
    </section>
  );
}
