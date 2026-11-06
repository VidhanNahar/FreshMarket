import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";

export const ARKIV_RABDI_CHAIN_ID = 7794095;

/**
 * Access key retrieved from environment.
 * The access key should be restricted to your domain origin at https://hub.arkiv.network/access-keys.
 */
export const ARKIV_ACCESS_KEY = process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY || "";

// Warn developers during development if no access key is provided
if (typeof window !== "undefined" && !ARKIV_ACCESS_KEY) {
  console.warn(
    "[FreshMarket] NEXT_PUBLIC_ARKIV_ACCESS_KEY is not set. Arkiv requests will use the rate-limited public endpoint. Get a free key at https://hub.arkiv.network/access-keys"
  );
}

/**
 * Chain configuration for Wallet (Wagmi / RainbowKit).
 * Per official Arkiv React integration guide:
 * MUST use rabdi({ accessKey: "" }) so connected browser wallets don't expose access keys.
 */
export const rabdiWalletChain = rabdi({ accessKey: "" });

/**
 * Chain configuration for Public Read Client.
 * Uses the restricted access key for faster, higher-rate-limit public catalog queries.
 */
export const rabdiReadChain = rabdi({ accessKey: ARKIV_ACCESS_KEY });

/**
 * Singleton / factory helper returning an Arkiv Public Client for queries.
 */
let cachedPublicClient: ReturnType<typeof createPublicClient> | null = null;

export function getArkivPublicClient() {
  if (!cachedPublicClient) {
    cachedPublicClient = createPublicClient({
      chain: rabdiReadChain,
      transport: http(undefined, { timeout: 15_000, retryCount: 1 }),
    });
  }
  return cachedPublicClient;
}
