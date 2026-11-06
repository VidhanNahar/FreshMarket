"use client";

import { useAccount, useChainId } from "wagmi";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  RABDI_CHAIN_ID,
  RABDI_CHAIN_NAME,
  describeChain,
  isRabdiChain,
} from "@/lib/wallet/wallet-ui";

/**
 * Compact live network indicator for the navbar.
 * Shows the required Rabdi network when disconnected, and the actual
 * wallet network once connected.
 */
export function NetworkStatusBadge({ className }: { className?: string }) {
  const { isConnected } = useAccount();
  const identityPage = usePathname() === "/identity";
  const chainId = useChainId();
  const onRabdi = identityPage ? chainId === 11155111 : isRabdiChain(chainId);
  const requiredName = identityPage ? "Ethereum Sepolia" : RABDI_CHAIN_NAME;
  const requiredId = identityPage ? 11155111 : RABDI_CHAIN_ID;

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

  return (
    <Badge
      variant="outline"
      className={cn(
        "hidden lg:inline-flex",
        onRabdi
          ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        className
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          onRabdi ? "bg-emerald-500" : "bg-amber-500"
        )}
        aria-hidden="true"
      />
      {onRabdi ? `${requiredName} · ${requiredId}` : `Wrong network · ${describeChain(chainId)}`}
    </Badge>
  );
}
