import {
  type Listing,
  type ListingFilters,
  type ListingCondition,
  type ListingFulfilment,
  isListingCondition,
  isListingFulfilment,
} from "@/domain/listing";
import { parseListingPrice } from "@/lib/listing-price-input";
import { isCategoryPath, parentCategory, resolveQuery, type ResolvedQuery } from "../../shared/categories";
import { normalizeText, textMatchScore } from "../../shared/search";

export const LISTING_SORTS = ["newest", "price-asc", "price-desc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

/** URL-backed browse filters; "" means unset. */
export interface DiscoveryFilters {
  q: string;
  category: string;
  city: string;
  condition: ListingCondition | "";
  fulfilment: ListingFulfilment | "";
  minPrice: string; // USDT, decimal text
  maxPrice: string;
  sort: ListingSort;
}

const FILTER_KEYS = ["q", "category", "city", "condition", "fulfilment", "minPrice", "maxPrice"] as const;

export function parseDiscoveryFilters(params: Pick<URLSearchParams, "get">): DiscoveryFilters {
  const read = (key: string) => params.get(key)?.trim() ?? "";
  const sort = read("sort");
  const condition = read("condition");
  const fulfilment = read("fulfilment");
  const category = read("category");
  return {
    q: read("q"),
    category: isCategoryPath(category) ? category : "",
    city: read("city"),
    condition: isListingCondition(condition) ? condition : "",
    fulfilment: isListingFulfilment(fulfilment) ? fulfilment : "",
    minPrice: read("minPrice"),
    maxPrice: read("maxPrice"),
    sort: LISTING_SORTS.includes(sort as ListingSort) ? sort as ListingSort : "newest",
  };
}

export function discoveryQuery(filters: DiscoveryFilters): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    if (filters[key].trim()) params.set(key, filters[key].trim());
  }
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return params.toString();
}

function priceBound(value: string): bigint | undefined {
  if (!value) return undefined;
  try { return parseListingPrice(value); } catch { return undefined; }
}

export interface DiscoveryPlan {
  /** Indexed Arkiv filters for the candidate fetch. */
  arkiv: Omit<ListingFilters, "limit" | "offset">;
  /** Words matched against title, description, brand and model of the candidates. */
  textWords: string[];
  resolved: ResolvedQuery;
}

/**
 * Splits a browse request into indexed Arkiv filters and leftover text words.
 * "dogtoy" becomes categoryPaths ["pets/dogs/toys"] with no text words, so Arkiv returns
 * exactly the dog toys, including ones whose title never says "dog toy".
 */
export function planDiscovery(filters: DiscoveryFilters): DiscoveryPlan {
  const resolved = resolveQuery(filters.q);
  const arkiv: DiscoveryPlan["arkiv"] = {
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.condition ? { condition: filters.condition } : {}),
    ...(filters.fulfilment ? { fulfilment: filters.fulfilment } : {}),
  };
  const minPriceMinor = priceBound(filters.minPrice);
  const maxPriceMinor = priceBound(filters.maxPrice);
  if (minPriceMinor !== undefined) arkiv.minPriceMinor = minPriceMinor;
  if (maxPriceMinor !== undefined && (minPriceMinor === undefined || maxPriceMinor >= minPriceMinor)) arkiv.maxPriceMinor = maxPriceMinor;

  let textWords = resolved.textWords;
  if (filters.category) {
    // A query category inside the chosen branch narrows it; one outside it becomes plain text.
    const inside = resolved.categoryPaths.filter((path) => path === filters.category || path.startsWith(`${filters.category}/`));
    arkiv.categoryPaths = inside.length ? inside : [filters.category];
    if (!inside.length) textWords = normalizeText(filters.q).split(" ").filter(Boolean);
  } else if (resolved.categoryPaths.length) {
    arkiv.categoryPaths = resolved.categoryPaths;
  }
  return { arkiv, textWords, resolved };
}

type SearchAll = (filters: Omit<ListingFilters, "limit" | "offset">) => Promise<Listing[]>;

/**
 * Fetches candidates with indexed filters only:
 * 1. a category from the query or picker (startsWith), one level up if that branch is empty;
 * 2. otherwise leftover words as a brand or model key ("lenovo", "iphone13");
 * 3. otherwise the remaining indexed filters, and text matching narrows the result.
 */
export async function fetchDiscoveryCandidates(plan: DiscoveryPlan, searchAll: SearchAll): Promise<Listing[]> {
  const paths = plan.arkiv.categoryPaths ?? [];
  if (paths.length) {
    const listings = await searchAll(plan.arkiv);
    const parent = paths.length === 1 ? parentCategory(paths[0]) : undefined;
    if (listings.length || !parent) return listings;
    return searchAll({ ...plan.arkiv, categoryPaths: [parent] });
  }
  if (plan.textWords.length) {
    const byKey = await searchAll({ ...plan.arkiv, brandOrModel: plan.textWords.join("") });
    if (byKey.length) return byKey;
  }
  return searchAll(plan.arkiv);
}

/** The broader category actually shown when the requested branch had no listings. */
export function discoveryFallback(plan: DiscoveryPlan, listings: Listing[]): string | undefined {
  const paths = plan.arkiv.categoryPaths ?? [];
  if (paths.length !== 1 || !listings.length) return undefined;
  const inBranch = listings.some((listing) => listing.categoryPath === paths[0] || listing.categoryPath.startsWith(`${paths[0]}/`));
  return inBranch ? undefined : parentCategory(paths[0]);
}

/** Text matching and ranking over candidates that the indexed filters already narrowed. */
export function discoverListings(listings: Listing[], textWords: readonly string[], sort: ListingSort): Listing[] {
  const scored = listings.map((listing) => ({ listing, score: textMatchScore(listing, textWords) }))
    .filter(({ score }) => score > 0);
  return scored.sort((a, b) => {
    if (sort === "newest") {
      return (b.score - a.score) || (a.listing.createdAtBlock < b.listing.createdAtBlock ? 1 : a.listing.createdAtBlock > b.listing.createdAtBlock ? -1 : 0) ||
        a.listing.id.localeCompare(b.listing.id);
    }
    const price = a.listing.priceMinor < b.listing.priceMinor ? -1 : a.listing.priceMinor > b.listing.priceMinor ? 1 : 0;
    return (sort === "price-asc" ? price : -price) || a.listing.id.localeCompare(b.listing.id);
  }).map(({ listing }) => listing);
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
