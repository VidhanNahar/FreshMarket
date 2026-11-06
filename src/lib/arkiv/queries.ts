import { CatalogueReadLimitError } from "../../../shared/catalogue-limits";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { ListingFilters } from "@/domain/listing";
import { listingRepository } from "@/services/listing-repository";
import { ARKIV_RABDI_CHAIN_ID } from "./chain";

// TanStack hashes keys with JSON.stringify, which cannot serialize bigint.
function serializableFilters(filters: ListingFilters) {
  return {
    ...filters,
    minPriceMinor: filters.minPriceMinor?.toString(),
    maxPriceMinor: filters.maxPriceMinor?.toString(),
  };
}

/** Shared prefix lets successful writes refresh catalog, seller inventory and detail caches. */
export const listingKeys = {
  all: ["arkiv-listings", ARKIV_RABDI_CHAIN_ID] as const,
  catalog: (filters: Omit<ListingFilters, "limit" | "offset"> = {}) =>
    [...listingKeys.all, "catalog", serializableFilters(filters)] as const,
  search: (filters: ListingFilters = {}) => [...listingKeys.all, "search", serializableFilters(filters)] as const,
  detail: (id: string) => [...listingKeys.all, "detail", id.toLowerCase()] as const,
};

/** Reads never access Wagmi or request a wallet connection. Errors remain errors, not empty arrays. */
export function search(filters: ListingFilters = {}) {
  return listingRepository.search(filters);
}
export function getListingById(id: string) {
  return listingRepository.getById(id);
}

/** Inspect wrapped RPC causes without logging access-key URLs or wallet/provider details. */
export function readErrorKind(error: unknown): "rate-limit" | "network" | "other" {
  let node = error;
  let networkFailure = false;
  for (let depth = 0; depth < 6 && node && typeof node === "object"; depth++) {
    const e = node as { status?: number; code?: number; name?: string; message?: string; cause?: unknown };
    if (e.status === 429 || e.code === -32005 || /rate.?limit|too many requests/i.test(e.message ?? "")) return "rate-limit";
    if (/HttpRequestError|TimeoutError|SocketClosedError/.test(e.name ?? "") || /fetch failed|network|offline/i.test(e.message ?? "")) networkFailure = true;
    node = e.cause;
  }
  return networkFailure ? "network" : "other";
}

export function getListingReadErrorMessage(error: unknown): string {
  if (error instanceof CatalogueReadLimitError) return error.message;
  const kind = readErrorKind(error);
  if (kind === "rate-limit") return "Arkiv is busy. Wait a moment, then retry.";
  if (kind === "network") return "Could not reach Arkiv. Check your connection and retry.";
  return "Could not load listings. Please retry.";
}

// Bounded retries for transient failures only; invalid IDs/filters and schema errors fail fast.
export const listingReadPolicy = {
  staleTime: 30_000,
  retry: (failureCount: number, error: unknown) => failureCount < 2 && readErrorKind(error) !== "other",
  retryDelay: (attempt: number) => Math.min(1_000 * 2 ** attempt, 8_000),
};

export function listingsQueryOptions(filters: ListingFilters = {}) {
  // Snapshot the filters so mutation by a caller cannot change an in-flight query's meaning.
  const snapshot = { ...filters };
  return queryOptions({ ...listingReadPolicy, queryKey: listingKeys.search(snapshot), queryFn: () => search(snapshot) });
}
export function listingQueryOptions(id: string) {
  return queryOptions({ ...listingReadPolicy, queryKey: listingKeys.detail(id), queryFn: () => getListingById(id), enabled: Boolean(id) });
}

export function invalidateListings(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: listingKeys.all });
}
