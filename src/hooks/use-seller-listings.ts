"use client";

import { useQuery } from "@tanstack/react-query";
import { listingRepository } from "@/services/listing-repository";
import { listingKeys, listingReadPolicy } from "@/lib/arkiv/queries";
import type { Hex } from "viem";

export function useSellerListings(address?: Hex, paused = false) {
  return useQuery({
    ...listingReadPolicy,
    queryKey: [...listingKeys.all, "owned", address?.toLowerCase()],
    queryFn: () => listingRepository.searchOwned(address!),
    enabled: Boolean(address) && !paused,
    refetchInterval: paused ? false : 60_000,
  });
}
