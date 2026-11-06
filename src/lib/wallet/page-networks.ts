import { ENS_SEPOLIA_CHAIN_ID, isEnsPage } from "@/lib/ens/config";
import { WHITECHAIN_SEPOLIA_CHAIN_ID } from "@/freshpay/chain";
import { RABDI_CHAIN_ID, RABDI_CHAIN_NAME } from "./wallet-ui";

/** Each chain does one job: Arkiv listings, ENS identity on Sepolia, USDT payments on Whitechain. */
export type PageNetwork = "rabdi" | "sepolia" | "whitechain";

/** Payment pages. Their wallet actions run on Whitechain Sepolia, not Arkiv Rabdi. */
export const WHITECHAIN_PAGES = ["/checkout", "/receipt", "/merchant", "/checkout-demo"] as const;

export function isWhitechainPage(pathname: string | null | undefined): boolean {
  const path = pathname ?? "";
  return WHITECHAIN_PAGES.some((page) => path === page || path.startsWith(`${page}/`));
}

export function pageNetwork(pathname: string | null | undefined): PageNetwork {
  if (isEnsPage(pathname)) return "sepolia";
  if (isWhitechainPage(pathname)) return "whitechain";
  return "rabdi";
}

export const PAGE_NETWORKS: Record<PageNetwork, { chainId: number; name: string }> = {
  rabdi: { chainId: RABDI_CHAIN_ID, name: RABDI_CHAIN_NAME },
  sepolia: { chainId: ENS_SEPOLIA_CHAIN_ID, name: "Ethereum Sepolia" },
  whitechain: { chainId: WHITECHAIN_SEPOLIA_CHAIN_ID, name: "Whitechain Sepolia" },
};
