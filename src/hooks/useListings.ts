"use client";

import { useQuery } from "@tanstack/react-query";
import { listingRepository } from "@/services/listing-repository";
import { getArkivPublicClient } from "@/lib/arkiv/chain";
import { listingKeys, listingQueryOptions, listingReadPolicy } from "@/lib/arkiv/queries";
import { discoverListings, isEntityKey, type DiscoveryFilters } from "@/lib/listing-discovery";

export function useListings(filters: DiscoveryFilters) {
  const query = useQuery({
    ...listingReadPolicy,
    queryKey: listingKeys.catalog({ category: filters.category, city: filters.city }),
    queryFn: () => listingRepository.searchAll({ category: filters.category, city: filters.city }),
    refetchInterval: 60_000,
  });
  const block = useRabdiBlock();
  const active = (query.data ?? []).filter((listing) =>
    block.data === undefined || listing.expiresAtBlock > block.data);
  return { ...query, data: discoverListings(active, filters), currentBlock: block.data };
}

export function useListing(id: string) {
  return useQuery({
    ...listingQueryOptions(id),
    enabled: isEntityKey(id),
    refetchInterval: 60_000,
  });
}

export function useRabdiBlock() {
  return useQuery({
    queryKey: ["rabdi", "blockNumber"],
    queryFn: () => getArkivPublicClient().getBlockNumber({ cacheTime: 0 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}
