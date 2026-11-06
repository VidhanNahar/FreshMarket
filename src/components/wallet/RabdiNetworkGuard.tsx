"use client";

import { useSyncExternalStore, useState } from "react";
import { useAccount, useBalance, useChainId, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import { AlertTriangle, Droplets, RefreshCw, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ARKIV_FAUCET_URL,
  RABDI_CHAIN_ID,
  RABDI_CHAIN_NAME,
  describeChain,
  formatBalanceWei,
  getWalletErrorReason,
  isLowBalance,
  isRabdiChain,
} from "@/lib/wallet/wallet-ui";

const METAMASK_URL = "https://metamask.io/download/";
const RABBY_URL = "https://rabby.io/";

const emptySubscribe = () => () => {};

/** True only after the client has hydrated, without setState in an effect. */
function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

/** Detect an injected EIP-1193 wallet (MetaMask, Rabby, ...). */
function useHasInjectedWallet() {
  return useSyncExternalStore(
    emptySubscribe,
    () => Boolean((window as Window & { ethereum?: unknown }).ethereum),
    () => false
  );
}

/**
 * Global Rabdi guard rendered under the navbar.
 *
 * - No injected wallet: dismissible hint with MetaMask/Rabby links.
 * - Connected on a different chain: one-click add/switch to Rabdi.
 * - Connected on Rabdi with a low balance: faucet warning.
 *
 * It never switches automatically on load, so users are not surprised by
 * a wallet popup; the switch only runs on an explicit click.
 */
export function RabdiNetworkGuard() {
  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending } = useSwitchChain();

  const [missingWalletDismissed, setMissingWalletDismissed] = useState(false);
  const mounted = useIsMounted();
  const hasInjectedWallet = useHasInjectedWallet();

  const unsupportedChain = Boolean(
    (chain as { unsupported?: boolean } | undefined)?.unsupported
  );
  const wrongNetwork =
    isConnected && (unsupportedChain || !isRabdiChain(chainId));

  const { data: balance } = useBalance({
    address,
    chainId: RABDI_CHAIN_ID,
    query: {
      enabled: Boolean(isConnected && address && isRabdiChain(chainId)),
    },
  });

  if (!mounted) return null;

  async function handleSwitch() {
    try {
      await switchChainAsync({ chainId: RABDI_CHAIN_ID });
      toast.success(`Switched to ${RABDI_CHAIN_NAME}`);
    } catch (error) {
      toast.error("Could not switch network", {
        description: getWalletErrorReason(error),
      });
    }
  }

  // 1. No browser wallet extension.
  if (!hasInjectedWallet && !isConnected && !missingWalletDismissed) {
    return (
      <div
        role="status"
        className="border-b border-amber-500/30 bg-amber-500/10"
      >
        <div className="container mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
          <Wallet
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-900 dark:text-amber-100">
              No browser wallet detected
            </p>
            <p className="text-xs text-muted-foreground">
              Install{" "}
              <a
                href={METAMASK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-800 underline underline-offset-2 dark:text-amber-200"
              >
                MetaMask
              </a>{" "}
              or{" "}
              <a
                href={RABBY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-800 underline underline-offset-2 dark:text-amber-200"
              >
                Rabby
              </a>{" "}
              to connect directly. You can still browse listings without a wallet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMissingWalletDismissed(true)}
            aria-label="Dismiss wallet notice"
            className="rounded p-1 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // 2. Connected on the wrong chain.
  if (wrongNetwork) {
    return (
      <div role="alert" className="border-b border-red-500/30 bg-red-500/10">
        <div className="container mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                Wrong network: {describeChain(chainId, chain?.name)}
              </p>
              <p className="text-xs text-muted-foreground">
                FreshMarket needs {RABDI_CHAIN_NAME} (chain ID {RABDI_CHAIN_ID}).
                One click adds the network to your wallet if it is missing, then
                switches to it.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
            <a
              href={ARKIV_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 underline underline-offset-2 dark:text-red-200"
            >
              <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
              Faucet
            </a>
            <Button
              type="button"
              size="sm"
              onClick={handleSwitch}
              disabled={isPending}
              className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800"
            >
              {isPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Switch to {RABDI_CHAIN_NAME}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Correct chain, but not enough testnet ETH for writes.
  if (
    isConnected &&
    isRabdiChain(chainId) &&
    balance &&
    isLowBalance(balance.value)
  ) {
    return (
      <div role="status" className="border-b border-amber-500/30 bg-amber-500/10">
        <div className="container mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-900 dark:text-amber-100">
              Low Rabdi balance ({formatBalanceWei(balance.value)} {balance.symbol})
            </p>
            <p className="text-xs text-muted-foreground">
              Arkiv listing writes are paid with testnet funds. Add free tokens
              from the{" "}
              <a
                href={ARKIV_FAUCET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-amber-800 underline underline-offset-2 dark:text-amber-200"
              >
                Arkiv faucet
              </a>{" "}
              before publishing. Browsing still works.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}