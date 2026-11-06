"use client";

import { useQuery } from "@tanstack/react-query";
import { listingRepository } from "@/services/listing-repository";
import { getArkivPublicClient } from "@/lib/arkiv/chain";
import { discoverListings, isEntityKey, type DiscoveryFilters } from "@/lib/listing-discovery";

export function useListings(filters: DiscoveryFilters) {
  const query = useQuery({
    queryKey: ["listings", { category: filters.category, city: filters.city }],
    queryFn: () => listingRepository.searchAll({ category: filters.category, city: filters.city }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const block = useRabdiBlock();
  const active = (query.data ?? []).filter((listing) =>
    block.data === undefined || listing.expiresAtBlock > block.data);
  return { ...query, data: discoverListings(active, filters), currentBlock: block.data };
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ["listing", id],
    queryFn: () => listingRepository.getById(id),
    enabled: isEntityKey(id),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
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
