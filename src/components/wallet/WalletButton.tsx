"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, ChevronDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { shortenAddress } from "@/lib/wallet/wallet-ui";
import { WalletSummary } from "./WalletSummary";
import { useSellerIdentity } from "@/hooks/use-seller-identity";

/** The wallet's verified ENS name (e.g. alice.freshmarket.eth), else its short address. */
function AccountLabel({ address }: { address: string }) {
  const identity = useSellerIdentity(address);
  // Keep the last verified name during the 60 s refresh (no flicker); drop it if a check fails.
  const name = !identity.isError ? identity.data?.name : undefined;
  return name
    ? <span className="max-w-[14rem] truncate text-xs font-semibold sm:text-sm" title={address}>{name}</span>
    : <span className="font-mono text-xs sm:text-sm">{shortenAddress(address)}</span>;
}

interface WalletButtonProps {
  /** Stretch to the container width (used in the mobile menu). */
  fullWidth?: boolean;
  className?: string;
}

/**
 * RainbowKit connect button with FreshMarket styling.
 *
 * - Disconnected: opens the RainbowKit connect modal.
 * - Connected on an unsupported chain: opens the chain modal to switch.
 * - Connected: shows the wallet's verified ENS name (or truncated address) and opens the
 *   detailed wallet dialog (copy, balance, faucet, disconnect).
 */
export function WalletButton({ fullWidth = false, className }: WalletButtonProps) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const base = cn(fullWidth && "w-full", "flex items-center gap-2", className);

  return (
    <>
      <ConnectButton.Custom>
        {({ account, chain, openChainModal, openConnectModal, mounted }) => {
          // Avoid hydration mismatch: RainbowKit cannot know the wallet
          // state until after the client mounts.
          if (!mounted) {
            return (
              <Button
                variant="outline"
                disabled
                aria-hidden="true"
                className={cn(base, "border-emerald-500/40")}
              >
                <Wallet className="h-4 w-4 text-emerald-500" />
                <span>Connect Wallet</span>
              </Button>
            );
          }

          if (!account) {
            return (
              <Button
                type="button"
                onClick={openConnectModal}
                className={cn(
                  base,
                  "bg-emerald-700 text-white hover:bg-emerald-800"
                )}
              >
                <Wallet className="h-4 w-4" />
                <span>Connect Wallet</span>
              </Button>
            );
          }

          if (chain?.unsupported) {
            return (
              <Button
                type="button"
                onClick={openChainModal}
                variant="outline"
                aria-label="Wrong network. Switch to Arkiv Rabdi Testnet."
                className={cn(
                  base,
                  "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                )}
              >
                <AlertTriangle className="h-4 w-4" />
                <span>Switch to Rabdi</span>
              </Button>
            );
          }

          return (
            <Button
              type="button"
              onClick={() => setSummaryOpen(true)}
              variant="outline"
              aria-label={`Wallet ${account.address}. Open wallet details.`}
              className={cn(
                base,
                "rounded-full border-emerald-500/40 pl-2.5 hover:border-emerald-500"
              )}
            >
              <span
                className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              <AccountLabel address={account.address} />
              <ChevronDown
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          );
        }}
      </ConnectButton.Custom>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your wallet</DialogTitle>
            <DialogDescription>
              Manage your connected wallet, check your Rabdi balance and get
              test funds from the faucet.
            </DialogDescription>
          </DialogHeader>
          <WalletSummary />
        </DialogContent>
      </Dialog>
    </>
  );
}