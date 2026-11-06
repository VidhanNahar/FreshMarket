import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { rabdiWalletChain } from "@/lib/arkiv/chain";
import { ensConfig } from "@/lib/ens/config";
import { whitechainSepolia } from "@/freshpay/chain";
import { freshPayConfig } from "@/lib/freshpay/config";

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
  // Start new sessions on Ethereum; preserve Rabdi when already connected there.
  // Marketplace guards require Rabdi before writes.
  chains: [mainnet, rabdiWalletChain, sepolia, whitechainSepolia],
  transports: {
    [rabdiWalletChain.id]: http(),
    [mainnet.id]: http(),
    // ENS actions select this chain explicitly; Arkiv's transport and initial session stay intact.
    [sepolia.id]: http(ensConfig.rpcUrl),
    // Checkout pages select Whitechain explicitly for USDT payments; no other page switches to it.
    [whitechainSepolia.id]: http(freshPayConfig.rpcUrl),
  },
  ssr: true,
});
