"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { getAddress, isAddress, type Address } from "viem";
import { ensConfig, ENS_SEPOLIA_CHAIN_ID } from "@/lib/ens/config";
import { resolveSellerIdentity } from "@/services/ens-identity";

/** Separate namespace/transport: ENS refreshes cannot invalidate or block Arkiv catalogue queries. */
export const ensIdentityKeys = {
  all: ["ens-storefront-identity", ENS_SEPOLIA_CHAIN_ID, ensConfig.rpcUrl, ensConfig.rootRegistry, ensConfig.universalResolver] as const,
  seller: (address: string) => [...ensIdentityKeys.all, address.toLowerCase()] as const,
};
export function sellerIdentityOptions(address: string) {
  return queryOptions({
    queryKey: ensIdentityKeys.seller(address),
    queryFn: () => resolveSellerIdentity(getAddress(address) as Address),
    enabled: isAddress(address),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    // Ownership can change independently of Arkiv. Do not show a stale verified badge
    // while refreshing or after a failed ownership check.
    refetchInterval: 60_000,
  });
}
export function useSellerIdentity(address: string) {
  return useQuery(sellerIdentityOptions(address));
}
