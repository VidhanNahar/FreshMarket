import { describe, it, expect } from "vitest";
import {
  ARKIV_RABDI_CHAIN_ID,
  rabdiWalletChain,
  rabdiReadChain,
  getArkivPublicClient,
} from "../lib/arkiv/chain";
import { wagmiConfig } from "../lib/wallet/config";

describe("Phase 1: Arkiv Rabdi Network & Web3 Configuration", () => {
  it("defines Rabdi chain with correct Chain ID 7794095", () => {
    expect(ARKIV_RABDI_CHAIN_ID).toBe(7794095);
    expect(rabdiWalletChain.id).toBe(7794095);
    expect(rabdiReadChain.id).toBe(7794095);
  });

  it("configures wallet chain with no access key per Arkiv React integration guide", () => {
    // rabdi({ accessKey: "" }) should point to default RPC host without token path
    const rpcUrl = rabdiWalletChain.rpcUrls.default.http[0];
    expect(rpcUrl).toBeDefined();
    expect(rpcUrl).not.toContain("undefined");
  });

  it("initializes Wagmi configuration with Rabdi chain", () => {
    expect(wagmiConfig).toBeDefined();
    expect(wagmiConfig.chains[0].id).toBe(7794095);
  });

  it("exports working Arkiv Public Client with query capabilities", () => {
    const client = getArkivPublicClient();
    expect(client).toBeDefined();
    expect(typeof client.select).toBe("function");
    expect(typeof client.getEntity).toBe("function");
    expect(typeof client.getBlockNumber).toBe("function");
  });

  it("connects to live Arkiv Rabdi testnet and queries current block number", async () => {
    const client = getArkivPublicClient();
    const blockNumber = await client.getBlockNumber();
    expect(typeof blockNumber).toBe("bigint");
    expect(blockNumber > BigInt(0)).toBe(true);
  }, 10000);
});
