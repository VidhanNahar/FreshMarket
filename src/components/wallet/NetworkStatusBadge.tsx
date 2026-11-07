"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import { usePathname } from "next/navigation";
import { PAGE_NETWORKS, pageNeedsWalletNetwork, pageNetwork } from "@/lib/wallet/page-networks";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeChain, getWalletErrorReason } from "@/lib/wallet/wallet-ui";

/**
 * Compact live network indicator for the navbar.
 * Shows the network the current page needs (Rabdi, Sepolia for ENS, Whitechain for
 * checkout) when disconnected, and the actual wallet network once connected. Read-only pages
 * (browse, listing detail, SECOND LOOK) work on any network, so they never ask for a switch.
 */
export function NetworkStatusBadge({ className }: { className?: string }) {
  const { isConnected } = useAccount();
  const pathname = usePathname();
  const required = PAGE_NETWORKS[pageNetwork(pathname)];
  const chainId = useChainId();
  const onRequired = chainId === required.chainId;
  const requiredName = required.name;
  const requiredId = required.chainId;
  const { switchChainAsync, isPending } = useSwitchChain();

  if (!isConnected) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "hidden border-border/60 text-muted-foreground lg:inline-flex",
          className
        )}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
        {requiredName}
      </Badge>
    );
  }

  if (!pageNeedsWalletNetwork(pathname) && !onRequired) {
    return (
      <Badge variant="outline" className={cn("hidden whitespace-nowrap border-border/60 text-muted-foreground lg:inline-flex", className)}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        {describeChain(chainId)}
      </Badge>
    );
  }

  if (onRequired) {
    return (
      <Badge variant="outline" className={cn("hidden whitespace-nowrap border-emerald-500/30 text-emerald-600 dark:text-emerald-400 lg:inline-flex", className)}>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        {requiredName} · {requiredId}
      </Badge>
    );
  }

  // Wrong network for this page: the badge is the switch button (it adds the chain if missing).
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={async () => {
        try { await switchChainAsync({ chainId: requiredId }); }
        catch (error) { toast.error("Could not switch network", { description: getWalletErrorReason(error) }); }
      }}
      title={`Wallet is on ${describeChain(chainId)}; click to switch to ${requiredName} (chain ${requiredId})`}
      className={cn(
        "hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-300 lg:inline-flex",
        className
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
      {isPending ? "Check your wallet…" : `Switch to ${requiredName}`}
    </button>
  );
}
