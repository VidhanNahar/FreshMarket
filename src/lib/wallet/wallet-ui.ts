import { formatUnits } from "viem";

/**
 * Arkiv Rabdi testnet chain ID.
 * Kept in sync with `ARKIV_RABDI_CHAIN_ID` in `src/lib/arkiv/chain.ts`
 * (a unit test asserts the two values match).
 */
export const RABDI_CHAIN_ID = 7794095;

export const RABDI_CHAIN_NAME = "Arkiv Rabdi Testnet";

/** Public Arkiv Hub links used by the wallet UI. */
export const ARKIV_FAUCET_URL = "https://hub.arkiv.network/faucet";
export const ARKIV_ACCESS_KEYS_URL = "https://hub.arkiv.network/access-keys";

/**
 * Show a friendly low-balance warning below this amount (0.001 ETH).
 * Rabdi faucet funds are only needed for Arkiv write transactions.
 */
export const LOW_BALANCE_THRESHOLD_WEI = 1_000_000_000_000_000n;

/**
 * Shorten an EVM address for display, e.g.
 * `0x1234567890abcdef...` -> `0x1234...cdef`.
 */
export function shortenAddress(
  address?: string | null,
  leading = 6,
  trailing = 4
): string {
  if (!address) return "";
  if (address.length <= leading + trailing + 3) return address;
  return `${address.slice(0, leading)}...${address.slice(-trailing)}`;
}

/** True only for the Arkiv Rabdi testnet chain ID. */
export function isRabdiChain(chainId?: number | null): boolean {
  return chainId === RABDI_CHAIN_ID;
}

const KNOWN_CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum Mainnet",
  10: "OP Mainnet",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum One",
  11155111: "Sepolia",
  [RABDI_CHAIN_ID]: RABDI_CHAIN_NAME,
};

/**
 * Human-readable network label for a chain ID.
 * Falls back to the wallet-provided name, then "Chain ID <n>".
 */
export function describeChain(chainId?: number | null, walletName?: string): string {
  if (chainId === undefined || chainId === null) return "Unknown network";
  const known = KNOWN_CHAIN_NAMES[chainId];
  if (known) return known;
  if (walletName && walletName.toLowerCase() !== "unknown network") return walletName;
  return `Chain ID ${chainId}`;
}

/** True when a Rabdi balance is below the user-visible warning threshold. */
export function isLowBalance(balanceWei?: bigint | null): boolean {
  if (balanceWei === undefined || balanceWei === null) return false;
  return balanceWei < LOW_BALANCE_THRESHOLD_WEI;
}

/**
 * Format a wei balance as a decimal string with a fixed precision.
 * Uses viem's `formatUnits` so large values do not lose precision.
 */
export function formatBalanceWei(
  wei: bigint,
  decimals = 18,
  precision = 4
): string {
  const raw = formatUnits(wei, decimals);
  if (precision <= 0) return raw.split(".")[0] ?? "0";

  const [whole = "0", fraction = ""] = raw.split(".");
  const paddedFraction = fraction.padEnd(precision, "0").slice(0, precision);
  return `${whole}.${paddedFraction}`;
}

const DEFAULT_WALLET_ERROR =
  "Could not complete the wallet request. Please try again.";

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  shortMessage?: unknown;
  details?: unknown;
  cause?: unknown;
};

/**
 * Flatten the useful text/code from a wallet error. Viem and wagmi often
 * nest the real rejection inside `cause`, `shortMessage` or `details`.
 */
function collectWalletError(error: unknown): { message: string; code: unknown } {
  if (typeof error === "string") return { message: error, code: undefined };
  if (!error || typeof error !== "object") {
    return { message: "", code: undefined };
  }

  const parts: string[] = [];
  let code: unknown;
  let current: unknown = error;

  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth += 1) {
    const node = current as ErrorLike;
    if (code === undefined && node.code !== undefined) code = node.code;
    for (const key of ["shortMessage", "message", "details"] as const) {
      const value = node[key];
      if (typeof value === "string" && value.length > 0) parts.push(value);
    }
    current = node.cause;
  }

  return { message: parts.join(" "), code };
}

/**
 * Map raw wallet / wagmi errors to short, friendly copy.
 * Handles user rejection, missing extension, pending requests and
 * wallets that do not know the Rabdi network yet.
 */
export function getWalletErrorReason(error: unknown): string {
  if (!error) return DEFAULT_WALLET_ERROR;

  const { message, code } = collectWalletError(error);
  const lower = message.toLowerCase();

  if (lower.includes("unauthorized") || lower.includes("notowner") || /is owned by.*not /.test(lower) || lower.includes("not the owner") || lower.includes("only the listing owner")) {
    return "Only the listing owner can change or delete this item. Connect the seller wallet and try again.";
  }
  if (lower.includes("account changed")) return "Your wallet account changed. Reconnect the seller wallet and try again.";
  if (lower.includes("expired") || lower.includes("listing is missing")) return "This listing is no longer available. Refresh your listings.";

  if (lower.includes("invalid chainid") || lower.includes("chain is not approved")) {
    return "Your wallet session has not approved Arkiv Rabdi. Disconnect FreshMarket in your wallet, add the Rabdi network, then reconnect. If your mobile wallet does not support custom networks, use MetaMask or Rabby in your browser.";
  }

  if (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  ) {
    return "Request rejected in your wallet. Nothing was changed.";
  }

  if (
    lower.includes("no provider") ||
    lower.includes("not installed") ||
    lower.includes("no injected") ||
    lower.includes("wallet not found") ||
    lower.includes("provider not found")
  ) {
    return "No browser wallet found. Install MetaMask or Rabby, then try again.";
  }

  if (lower.includes("already pending")) {
    return "A wallet request is already pending. Open your wallet to continue.";
  }

  if (
    lower.includes("unrecognized chain") ||
    lower.includes("chain not added") ||
    lower.includes("try adding the chain")
  ) {
    return "Arkiv Rabdi is not added to your wallet. Approve the network request to continue.";
  }

  if (lower.includes("arkiv rabdi")) return "Connect the seller wallet on Arkiv Rabdi before changing this listing.";

  return DEFAULT_WALLET_ERROR;
}
