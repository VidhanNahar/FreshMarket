import { getAddress, type Address } from "viem";
import { WHITECHAIN_SEPOLIA_RPC_URL, WHITECHAIN_SEPOLIA_USDT } from "@/freshpay/chain";
import { isPlaceholderUrl } from "@/lib/ens/config";

/** Public Whitechain settings only. Deployer keys stay in the Foundry environment, never here. */
const configurationErrors: string[] = [];
function contract(value: string | undefined): Address | null {
  if (!value?.trim()) return null;
  try { return getAddress(value.trim()); }
  catch { configurationErrors.push("Invalid FreshPay contract address"); return null; }
}
function rpcUrl(value: string | undefined) {
  if (isPlaceholderUrl(value)) return WHITECHAIN_SEPOLIA_RPC_URL;
  try {
    const url = new URL(value?.trim() || WHITECHAIN_SEPOLIA_RPC_URL);
    if (url.protocol !== "https:") throw new Error();
    return url.href;
  } catch { configurationErrors.push("Invalid Whitechain RPC URL"); return WHITECHAIN_SEPOLIA_RPC_URL; }
}
function block(value: string | undefined) {
  if (!value?.trim()) return 0n;
  try { return BigInt(value.trim()); }
  catch { configurationErrors.push("Invalid FreshPay deploy block"); return 0n; }
}

export const freshPayConfig = {
  rpcUrl: rpcUrl(process.env.NEXT_PUBLIC_WHITECHAIN_SEPOLIA_RPC_URL),
  /** null until the contract is deployed; checkout then explains it is unavailable. */
  contract: contract(process.env.NEXT_PUBLIC_FRESHPAY_ADDRESS),
  /** First block to scan for FreshPay events (receipts and webhooks). */
  deployBlock: block(process.env.NEXT_PUBLIC_FRESHPAY_DEPLOY_BLOCK),
  token: WHITECHAIN_SEPOLIA_USDT,
};

// Bad optional payment configuration disables checkout, never the marketplace.
export const freshPayConfigurationError = configurationErrors.join("; ") || null;
