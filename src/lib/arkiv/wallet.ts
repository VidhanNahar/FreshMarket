import { createWalletClient } from "@arkiv-network/sdk";
import { custom, type Hex, type WalletClient } from "viem";
import { ARKIV_RABDI_CHAIN_ID, rabdiWalletChain } from "./chain";

export interface WalletWriteEvents {
  onSignatureRequested?: () => void;
  onSubmitted?: (txHash: Hex) => void;
}

/**
 * Reuse Wagmi's provider/account, not a private key or public HTTP write transport.
 * Observe the wallet's send request to distinguish signature approval from mining.
 * Transport retries are disabled: a failed write must never silently publish twice.
 */
export async function createListingWalletClient(wallet: WalletClient, events: WalletWriteEvents = {}) {
  if (!wallet.account || wallet.chain?.id !== ARKIV_RABDI_CHAIN_ID) {
    throw new Error("Connect a wallet on Arkiv Rabdi before publishing");
  }
  // Check the provider too: configured chain metadata can lag a wallet network switch.
  const chainId = await wallet.transport.request({ method: "eth_chainId" }, { retryCount: 0 });
  if (Number(chainId) !== ARKIV_RABDI_CHAIN_ID) throw new Error("Switch your wallet to Arkiv Rabdi");
  return createWalletClient({
    account: wallet.account,
    chain: rabdiWalletChain,
    transport: custom({
      request: async (args) => {
        const sending = args.method === "eth_sendTransaction" || args.method === "eth_sendRawTransaction";
        if (sending) {
          // A wallet can switch accounts/networks while ownership reads or gas estimation run.
          const currentChain = await wallet.transport.request({ method: "eth_chainId" }, { retryCount: 0 });
          const accounts = await wallet.transport.request({ method: "eth_accounts" }, { retryCount: 0 });
          if (Number(currentChain) !== ARKIV_RABDI_CHAIN_ID) throw new Error("Switch your wallet to Arkiv Rabdi");
          if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== wallet.account!.address.toLowerCase()) {
            throw new Error("Wallet account changed. Reconnect and try again.");
          }
          events.onSignatureRequested?.();
        }
        const result = await wallet.transport.request(args, { retryCount: 0 });
        if (sending) events.onSubmitted?.(result as Hex);
        return result;
      },
    }, { retryCount: 0 }),
  });
}
