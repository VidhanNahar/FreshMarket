"use client";

import { useAccount, useChainId } from "wagmi";
import { usePathname } from "next/navigation";
import { PAGE_NETWORKS, pageNeedsWalletNetwork, pageNetwork } from "@/lib/wallet/page-networks";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeChain } from "@/lib/wallet/wallet-ui";

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

  return (
    <Badge
      variant="outline"
      className={cn(
        "hidden whitespace-nowrap lg:inline-flex",
        onRequired
          ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        className
      )}
      title={onRequired ? undefined : `Wallet is on ${describeChain(chainId)}; this page needs ${requiredName} (chain ${requiredId})`}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          onRequired ? "bg-emerald-500" : "bg-amber-500"
        )}
        aria-hidden="true"
      />
      {/* Name the network this page needs; the tooltip names the one the wallet is on. */}
      {onRequired ? `${requiredName} · ${requiredId}` : `Switch to ${requiredName}`}
    </Badge>
  );
}
