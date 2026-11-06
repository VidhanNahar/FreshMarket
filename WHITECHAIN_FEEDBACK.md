# Whitechain feedback

Notes from building FreshPay on Whitechain Sepolia during ETHGlobal Mumbai 2026. The team should add its own deployment and demo experience before submitting.

## What worked

- `docs.whitechain.io/llms.txt` and the `.md` version of every page made the docs easy to read programmatically. The network reference (chain ID, RPC, explorer, rate limits, EVM version) was complete and accurate.
- The Foundry deploy page and Blockscout verifier flags worked as written. Forking `https://rpc.testnet.whitechain.io` with Anvil was fast, and the official test USDT behaved like a standard OpenZeppelin ERC-20 under `SafeERC20`.
- The Blockscout Etherscan-style `getLogs` API filters by topic with no block-range cap, which made order history cheap to read.

## Where we got stuck

- **Two "USDT" contracts.** The docs' token list and Portal bridge page name `0xaa7962d0…8f46` (it reports `USDT.e`), but the Operate track requires `0xcedfB561…55a7` (a `TetherTokenV2` proxy). Nothing in the docs mentions the second address, so we confirmed it only through the prize page and `symbol()`/`decimals()` calls.
- **Getting test USDT.** The faucet gives WBT; we found no documented way to get the official test USDT for a demo payment.
- **`eth_getLogs` range.** The public RPC rejects ranges over 10,000 blocks (`query exceeds max block range 10000`). The network reference lists request-rate limits but not this one; at one block per second it is under three hours of history.

## What the docs were missing

- The official test USDT address, with how to obtain it and its decimals, on the testnet page.
- The `eth_getLogs` block-range limit in the RPC limits table.
- Whether `TetherTokenV2` on Whitechain Sepolia supports EIP-2612 `permit` / EIP-3009, which decides whether a one-signature checkout is possible.
