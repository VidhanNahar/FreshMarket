import { createPublicClient, createWalletClient, custom, http, type Hex, type WalletClient } from "viem";
import { sepolia } from "viem/chains";
import { ensConfig, ENS_SEPOLIA_CHAIN_ID } from "./config";

// This singleton never reads Wagmi's active chain, Arkiv's transport, or its cache keys.
// ENS failures/timeouts must not change whether an Arkiv listing can be fetched.
export const ensPublicClient = createPublicClient({
  chain: sepolia,
  transport: http(ensConfig.rpcUrl, { timeout: 6_000, retryCount: 0 }),
  ccipRead: false, // Do not allow an untrusted seller's resolver to trigger arbitrary HTTP fetches.
});

export interface EnsWriteEvents {
  onSignatureRequested?: () => void;
  onSubmitted?: (hash: Hex) => void;
}

/** Switching chains is an explicit UI action. This adapter never changes the wallet network. */
export async function createEnsWalletClient(wallet: WalletClient, events: EnsWriteEvents = {}) {
  if (!wallet.account || wallet.chain?.id !== ENS_SEPOLIA_CHAIN_ID) throw new Error("Connect your wallet on Ethereum Sepolia for ENS operations");
  const actualChain = await wallet.transport.request({ method: "eth_chainId" }, { retryCount: 0 });
  if (Number(actualChain) !== ENS_SEPOLIA_CHAIN_ID) throw new Error("Switch your wallet to Ethereum Sepolia");
  return createWalletClient({
    account: wallet.account,
    chain: sepolia,
    transport: custom({ request: async (args) => {
      const sending = args.method === "eth_sendTransaction" || args.method === "eth_sendRawTransaction";
      if (sending) events.onSignatureRequested?.();
      const result = await wallet.transport.request(args, { retryCount: 0 });
      if (sending) events.onSubmitted?.(result as Hex);
      return result;
    } }, { retryCount: 0 }),
  });
}
