import { createPublicClient, http } from "viem";
import { whitechainSepolia } from "@/freshpay/chain";
import { freshPayConfig } from "./config";

// Separate from Wagmi and the Arkiv client: a Whitechain outage must not affect listing reads.
export const whitechainPublicClient = createPublicClient({
  chain: whitechainSepolia,
  transport: http(freshPayConfig.rpcUrl, { timeout: 10_000, retryCount: 1 }),
});
