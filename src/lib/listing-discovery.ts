import type { Listing } from "@/domain/listing";

export const LISTING_SORTS = ["newest", "price-asc", "price-desc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];
export interface DiscoveryFilters {
  category: string;
  city: string;
  q: string;
  sort: ListingSort;
}

export function parseDiscoveryFilters(params: Pick<URLSearchParams, "get">): DiscoveryFilters {
  const sort = params.get("sort");
  return {
    category: params.get("category")?.trim() ?? "",
    city: params.get("city")?.trim() ?? "",
    q: params.get("q")?.trim() ?? "",
    sort: LISTING_SORTS.includes(sort as ListingSort) ? sort as ListingSort : "newest",
  };
}

export function discoveryQuery(filters: DiscoveryFilters): string {
  const params = new URLSearchParams();
  for (const key of ["category", "city", "q"] as const) {
    if (filters[key].trim()) params.set(key, filters[key].trim());
  }
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return params.toString();
}

export function discoverListings(listings: Listing[], filters: DiscoveryFilters): Listing[] {
  const search = filters.q.toLocaleLowerCase();
  return listings.filter((listing) => !search || listing.title.toLocaleLowerCase().includes(search))
    .sort((a, b) => {
      if (filters.sort === "newest") return b.createdAt - a.createdAt || a.id.localeCompare(b.id);
      // Group currencies instead of pretending prices in different currencies are equivalent.
      const currency = a.currency.localeCompare(b.currency);
      if (currency) return currency;
      const price = a.priceMinor < b.priceMinor ? -1 : a.priceMinor > b.priceMinor ? 1 : 0;
      return (filters.sort === "price-asc" ? price : -price) || a.id.localeCompare(b.id);
    });
}

export function isEntityKey(id: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(id);
}

/** Block-height expiry is approximate wall time, using Rabdi's two-second target. */
export function expirationLabel(expiresAtBlock: bigint, currentBlock?: bigint): string {
  if (currentBlock === undefined) return `Expires at block ${expiresAtBlock.toLocaleString("en-US")}`;
  const remaining = expiresAtBlock - currentBlock;
  if (remaining <= 0n) return "Expired";
  const seconds = remaining * 2n;
  if (seconds < 60n) return "Expires in less than a minute (estimated)";
  if (seconds < 3600n) return `Expires in ~${(seconds + 59n) / 60n} min`;
  if (seconds < 86400n) return `Expires in ~${(seconds + 3599n) / 3600n} hours`;
  return `Expires in ~${(seconds + 86399n) / 86400n} days`;
}

export function listingExplorerUrl(id: string): string {
  return `https://rabdi.explorer.arkiv.network/entity/${encodeURIComponent(id)}`;
}
