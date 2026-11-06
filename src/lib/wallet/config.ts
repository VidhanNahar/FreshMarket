import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { mainnet } from "wagmi/chains";
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
  // WalletConnect wallets may not know Rabdi until wallet_addEthereumChain.
  // Offer a standard chain so the session can approve a namespace through
  // which Wagmi can send the add/switch request for the custom network.
  // Rabdi stays first/default; marketplace guards still require its chain ID.
  chains: [rabdiWalletChain, mainnet],
  transports: {
    [rabdiWalletChain.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: true,
});
