"use client";

import { useState } from "react";
import { useAccount, useBalance, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  LogOut,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ARKIV_FAUCET_URL,
  RABDI_CHAIN_ID,
  RABDI_CHAIN_NAME,
  describeChain,
  formatBalanceWei,
  getWalletErrorReason,
  isLowBalance,
  isRabdiChain,
  shortenAddress,
} from "@/lib/wallet/wallet-ui";

/**
 * Detailed connected-wallet panel: truncated address with copy, current
 * network, Rabdi balance, faucet access and disconnect.
 *
 * Rendered inside the wallet dialog, and reusable on seller pages.
 */
export function WalletSummary() {
  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [copied, setCopied] = useState(false);

  const unsupportedChain = Boolean(
    (chain as { unsupported?: boolean } | undefined)?.unsupported
  );
  const onRabdi = isRabdiChain(chainId) && !unsupportedChain;
  const { data: balance } = useBalance({
    address,
    chainId: RABDI_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  if (!isConnected || !address) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        No wallet connected. Use the Connect Wallet button to get started.
      </div>
    );
  }

  async function handleCopy() {
    if (!address) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard unavailable. Open your wallet extension to copy the full address.");
    }
  }

  async function handleSwitch() {
    try {
      await switchChainAsync({ chainId: RABDI_CHAIN_ID });
      toast.success(`Switched to ${RABDI_CHAIN_NAME}`);
    } catch (error) {
      toast.error("Network switch failed", {
        description: getWalletErrorReason(error),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Address + copy */}
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Connected address
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-foreground" title={address}>
            {shortenAddress(address)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleCopy}
            aria-label="Copy full wallet address"
            className="gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? "Address copied to clipboard" : ""}
        </p>
      </div>

      {/* Network */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Network</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                onRabdi ? "bg-emerald-500" : "bg-red-500"
              )}
              aria-hidden="true"
            />
            {onRabdi ? RABDI_CHAIN_NAME : describeChain(chainId, chain?.name)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Required chain ID: {RABDI_CHAIN_ID}
          </p>
        </div>
        {!onRabdi && (
          <Button
            type="button"
            size="xs"
            onClick={handleSwitch}
            disabled={isSwitching}
            className="bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {isSwitching ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
            Switch
          </Button>
        )}
      </div>

      {/* Balance */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Rabdi balance</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">
            {balance ? `${formatBalanceWei(balance.value)} ${balance.symbol}` : "— ETH"}
          </p>
        </div>
        <a
          href={ARKIV_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Faucet
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      {/* Low-balance warning */}
      {onRabdi && balance && isLowBalance(balance.value) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-semibold">Low testnet balance</p>
            <p className="mt-0.5 text-muted-foreground">
              You have {formatBalanceWei(balance.value)} {balance.symbol} on Rabdi. Arkiv writes may
              fail. Get free test tokens from the{" "}
              <a
                href={ARKIV_FAUCET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                Arkiv faucet
              </a>
              .
            </p>
          </div>
        </div>
      )}

      {/* Faucet instructions */}
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Need test funds?</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>Open the Arkiv faucet and paste your wallet address.</li>
          <li>Request test tokens for Arkiv Rabdi (chain ID {RABDI_CHAIN_ID}).</li>
          <li>Come back and create a listing.</li>
        </ol>
        <a
          href={ARKIV_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Open Arkiv faucet
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => disconnect()}
        className="w-full gap-2 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
      >
        <LogOut className="h-4 w-4" />
        Disconnect wallet
      </Button>
    </div>
  );
}
