import { defineChain, type Address, type Hex } from "viem";

/** Whitechain Sepolia, the OP Stack testnet that settles FreshPay orders (docs.whitechain.io). */
export const WHITECHAIN_SEPOLIA_CHAIN_ID = 1874;
export const WHITECHAIN_SEPOLIA_RPC_URL = "https://rpc.testnet.whitechain.io";
export const WHITECHAIN_SEPOLIA_EXPLORER_URL = "https://explorer.testnet.whitechain.io";
export const WHITECHAIN_FAUCET_URL = "https://faucet.testnet.whitechain.io";

export const whitechainSepolia = defineChain({
  id: WHITECHAIN_SEPOLIA_CHAIN_ID,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: {
    default: { http: [WHITECHAIN_SEPOLIA_RPC_URL], webSocket: ["wss://rpc.testnet.whitechain.io/ws"] },
  },
  blockExplorers: {
    default: { name: "Whitechain Explorer", url: WHITECHAIN_SEPOLIA_EXPLORER_URL, apiUrl: `${WHITECHAIN_SEPOLIA_EXPLORER_URL}/api` },
  },
  testnet: true,
});

/**
 * Official test USDT named by the Whitechain Operate track (TetherTokenV2 proxy, 6 decimals).
 * Payments in any other token, including the bridged `USDT.e` in Whitechain's token list, do not count.
 */
export const WHITECHAIN_SEPOLIA_USDT: Address = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
export const USDT_DECIMALS = 6;

export const whitechainTxUrl = (hash: Hex) => `${WHITECHAIN_SEPOLIA_EXPLORER_URL}/tx/${hash}`;
export const whitechainAddressUrl = (address: Address) => `${WHITECHAIN_SEPOLIA_EXPLORER_URL}/address/${address}`;
