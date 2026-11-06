"use client";

import { useQuery } from "@tanstack/react-query";
import { listingRepository } from "@/services/listing-repository";
import { getArkivPublicClient } from "@/lib/arkiv/chain";
import { listingKeys, listingQueryOptions, listingReadPolicy } from "@/lib/arkiv/queries";
import {
  discoverListings, discoveryFallback, fetchDiscoveryCandidates, isEntityKey, planDiscovery, type DiscoveryFilters,
} from "@/lib/listing-discovery";

export function useListings(filters: DiscoveryFilters) {
  const plan = planDiscovery(filters);
  const query = useQuery({
    ...listingReadPolicy,
    // Text words are part of the key because they can switch the fetch to a brand/model lookup.
    queryKey: [...listingKeys.catalog(plan.arkiv), plan.textWords] as const,
    queryFn: () => fetchDiscoveryCandidates(plan, (arkiv) => listingRepository.searchAll(arkiv)),
    refetchInterval: 60_000,
  });
  const block = useRabdiBlock();
  const active = (query.data ?? []).filter((listing) =>
    block.data === undefined || listing.expiresAtBlock > block.data);
  return {
    ...query,
    hasData: query.data !== undefined,
    data: discoverListings(active, plan.textWords, filters.sort),
    currentBlock: block.data,
    resolved: plan.resolved,
    fallbackCategory: discoveryFallback(plan, active),
  };
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
    staleTime: 2_000,
    refetchInterval: 5_000,
    retry: 1,
  });
}
