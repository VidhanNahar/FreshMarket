"use client";

import { useAccountEffect } from "wagmi";
import { toast } from "sonner";
import { RABDI_CHAIN_NAME, shortenAddress } from "@/lib/wallet/wallet-ui";

/**
 * Side-effect only: wallet lifecycle toasts.
 * Mounted once inside the Wagmi/RainbowKit providers.
 */
export function WalletConnectionEffects() {
  useAccountEffect({
    onConnect(data) {
      toast.success("Wallet connected", {
        description: `${shortenAddress(data.address)} is connected. Get test tokens for ${RABDI_CHAIN_NAME} from the Arkiv faucet if your balance is low.`,
      });
    },
    onDisconnect() {
      toast("Wallet disconnected", {
        description: "You can browse without a wallet. Reconnect when you want to sell.",
      });
    },
  });

  return null;
}