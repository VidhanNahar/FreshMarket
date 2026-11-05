import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { rabdiWalletChain } from "@/lib/arkiv/chain";

/**
 * WalletConnect Project ID from environment.
 * Fallback provided for local development preview before credentials are configured.
 */
export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64";

export const wagmiConfig = getDefaultConfig({
  appName: "FreshMarket",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [rabdiWalletChain],
  transports: {
    [rabdiWalletChain.id]: http(),
  },
  ssr: true,
});
