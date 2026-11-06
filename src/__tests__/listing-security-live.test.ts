import { describe, expect, it } from "vitest";
import { createWalletClient } from "@arkiv-network/sdk";
import { custom, isAddress, type Hex } from "viem";
import { getArkivPublicClient, rabdiReadChain } from "@/lib/arkiv/chain";
import { listingRepository } from "@/services/listing-repository";
import { listingSchema } from "@/lib/arkiv/schema";

// Read-only simulations against a real, unexpired seller-A listing. No private key or broadcast.
describe.skipIf(!process.env.ARKIV_SECURITY_ENTITY_KEY)("live Rabdi cross-wallet authorization", () => {
  it.each(["patch", "delete"] as const)("rejects wallet B's direct SDK %s in gas estimation", async (operation) => {
    const id = process.env.ARKIV_SECURITY_ENTITY_KEY! as Hex;
    const other = (process.env.ARKIV_SECURITY_OTHER_WALLET ?? "0x2222222222222222222222222222222222222222") as Hex;
    expect(isAddress(other)).toBe(true);
    const listing = await listingRepository.getById(id);
    expect(listing).not.toBeNull();
    expect(listing!.owner.toLowerCase()).not.toBe(other.toLowerCase());
    const methods: string[] = [];
    const publicClient = getArkivPublicClient();
    const wallet = createWalletClient({ account: other, chain: rabdiReadChain,
      transport: custom({ request: async (args) => {
        methods.push(args.method);
        // An allowlist makes this test unable to sign, broadcast, or modify chain state.
        if (!["eth_estimateGas", "eth_call", "eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getTransactionCount", "eth_gasPrice", "eth_maxPriorityFeePerGas"].includes(args.method)) throw new Error(`Blocked non-read RPC: ${args.method}`);
        return publicClient.transport.request(args, { retryCount: 0 });
      } }, { retryCount: 0 }),
    });
    const request = operation === "patch" ? wallet.patchEntity(listingSchema, id, { set: { status: "sold" } }) : wallet.deleteEntity({ entityKey: id });
    // A generic network/insufficient-funds failure is not evidence of authorization rejection.
    await expect(request).rejects.toThrow(/NotOwner|owned by.*not /i);
    expect(methods).toContain("eth_estimateGas");
    expect(methods.some((method) => /send|sign/i.test(method))).toBe(false);
  }, 30_000);
});
