import { describe, expect, it } from "vitest";
import {
  BaseError, ContractFunctionRevertedError, createPublicClient, decodeErrorResult, decodeFunctionResult, encodeFunctionData, http,
  type Abi, type Address, type Hex, type Log,
} from "viem";
import { sepolia } from "viem/chains";
import { ensConfig } from "@/lib/ens/config";
import { EnsStorefrontService } from "@/services/ens-storefront";
import { EnsDelegationService } from "@/services/ens-delegation";
import { resolveSellerIdentity } from "@/services/ens-identity";

/**
 * End-to-end rehearsal of the /identity setup and /storefront/settings delegation using the app's REAL
 * service code. Each "transaction" is executed with eth_simulateV1 on top of live Sepolia state and later
 * reads see its effects, so nothing is signed or broadcast.
 *
 *   ENS_LIVE_TESTS=1 ENS_FLOW_OWNER=0x… NEXT_PUBLIC_ENS_PARENT_NAME=yourname.eth npx vitest run src/__tests__/ens-identity-flow-live.test.ts
 */
const owner = process.env.ENS_FLOW_OWNER as Address | undefined;
const manager: Address = "0x2000000000000000000000000000000000000F02"; // checksummed, as the service returns it
type Call = { from: Address; to: Address; data: Hex };
type Request = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; account?: Address | { address: Address } };

/** A public-client stand-in whose state is live Sepolia plus every transaction "sent" so far. */
function forkedSepolia() {
  const rpc = createPublicClient({ chain: sepolia, transport: http(ensConfig.rpcUrl, { timeout: 30_000 }) });
  const executed: Call[] = [];
  const receipts = new Map<Hex, { status: "success"; blockNumber: bigint; logs: Log[] }>();
  const allLogs: Log[] = [];
  let head: bigint | undefined;
  const from = (account: Request["account"]) => (typeof account === "string" ? account : account?.address) ?? owner!;
  const encode = (request: Request) => encodeFunctionData({ abi: request.abi, functionName: request.functionName, args: request.args ?? [] } as Parameters<typeof encodeFunctionData>[0]);

  async function run(call: Call) {
    const [block] = await rpc.simulateBlocks({ blocks: [{ calls: [...executed, call] }] });
    return block.calls.at(-1)!;
  }
  function revert(request: Request, data: Hex | undefined): never {
    let name = "unknown";
    try { if (data && data !== "0x") name = decodeErrorResult({ abi: request.abi, data }).errorName; } catch { name = data?.slice(0, 10) ?? "unknown"; }
    const reverted = new ContractFunctionRevertedError({ abi: request.abi, data: data && data !== "0x" ? data : undefined, functionName: request.functionName });
    throw new BaseError(`${request.functionName} reverted: ${name}`, { cause: reverted });
  }

  const client = {
    getBlockNumber: async () => (head ??= await rpc.getBlockNumber()),
    getBlock: () => rpc.getBlock(),
    getCode: (args: { address: Address }) => rpc.getCode(args),
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => receipts.get(hash)!,
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => receipts.get(hash)!,
    getLogs: async ({ address }: { address: Address }) => allLogs.filter((log) => log.address.toLowerCase() === address.toLowerCase()),
    readContract: async (request: Request) => {
      const result = await run({ from: owner!, to: request.address, data: encode(request) });
      if (result.status !== "success") revert(request, result.data);
      return decodeFunctionResult({ abi: request.abi, functionName: request.functionName, data: result.data } as Parameters<typeof decodeFunctionResult>[0]);
    },
    simulateContract: async (request: Request) => {
      const result = await run({ from: from(request.account), to: request.address, data: encode(request) });
      if (result.status !== "success") revert(request, result.data);
      return { request: { ...request, account: from(request.account) } };
    },
  };
  function walletFor(address: Address) {
    return {
      account: { address, type: "json-rpc" as const }, chain: sepolia,
      writeContract: async (request: Request) => {
        const call = { from: address, to: request.address, data: encode(request) };
        const result = await run(call);
        if (result.status !== "success") revert(request, result.data);
        executed.push(call);
        const hash = `0x${executed.length.toString(16).padStart(64, "0")}` as Hex;
        const blockNumber = (await client.getBlockNumber()) + 1n;
        const logs = result.logs.map((log, logIndex) => ({ ...log, blockNumber, logIndex, transactionHash: hash, removed: false })) as unknown as Log[];
        allLogs.push(...logs);
        receipts.set(hash, { status: "success", blockNumber, logs });
        return hash;
      },
    };
  }
  return { client, walletFor };
}

describe.skipIf(!process.env.ENS_LIVE_TESTS || !owner || !process.env.NEXT_PUBLIC_ENS_PARENT_NAME)("live /identity → /storefront/settings rehearsal", () => {
  it("runs every setup button, then verifies identity and delegation", async () => {
    const { client, walletFor } = forkedSepolia();
    const seller = walletFor(owner!);
    const storefront = new EnsStorefrontService(client as never);
    const delegation = new EnsDelegationService(client as never);
    const label = `alice${Date.now() % 100000}`;
    const name = `${label}.${ensConfig.parentName}`;
    const salt = () => BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

    // /identity section 1
    const registry = await storefront.deployParentRegistry(seller as never, salt());
    await storefront.attachParentRegistry(seller as never, registry.address);
    expect(await storefront.parentRegistry()).toBe(registry.address);
    // /identity section 2
    const resolver = await storefront.deploySellerResolver(seller as never, label, owner!, salt());
    const registered = await storefront.register(seller as never, { label, seller: owner!, resolver: resolver.address, expirationDays: 30 });
    expect(registered.name).toBe(name);
    // /identity section 3
    await storefront.updateProfile(seller as never, label, { avatar: "", description: "Vintage cameras", url: "https://example.com" });
    await storefront.setPrimaryName(seller as never, label);
    const identity = await resolveSellerIdentity(owner!, client as never);
    expect(identity?.name).toBe(name);
    expect(identity?.description).toBe("Vintage cameras");

    // /storefront/settings
    const records = await delegation.readStorefront(name);
    expect(records).toMatchObject({ verified: true, ownerCanDelegate: true, resolver: resolver.address });
    await delegation.grantTextDelegate(seller as never, name, "freshmarket.description", manager);
    expect(await delegation.listDelegates(resolver.address)).toEqual([{ account: manager, key: "freshmarket.description" }]);
    await delegation.setStorefrontText(walletFor(manager) as never, name, "freshmarket.description", "Managed by the shop assistant");
    expect((await delegation.checkTextEdit(name, "url", manager)).allowed).toBe(false);
    await delegation.revokeTextDelegate(seller as never, name, "freshmarket.description", manager);
    expect(await delegation.listDelegates(resolver.address)).toEqual([]);
    await expect(delegation.setStorefrontText(walletFor(manager) as never, name, "freshmarket.description", "after revoke")).rejects.toThrow("no permission");
  }, 300_000);
});
