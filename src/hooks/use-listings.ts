"use client";

import { useQuery } from "@tanstack/react-query";
import type { ListingFilters } from "@/domain/listing";
import { listingQueryOptions, listingsQueryOptions } from "@/lib/arkiv/queries";

/** Public marketplace page. data=[] means no matches; isError means the read failed. */
export function useListings(filters: ListingFilters = {}) {
  return useQuery(listingsQueryOptions(filters));
}

/** Empty IDs disable fetching. A null result means missing, expired, or incompatible. */
export function useListing(id: string) {
  return useQuery(listingQueryOptions(id));
}
