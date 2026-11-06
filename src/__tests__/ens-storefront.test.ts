import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionResult, keccak256, toBytes, zeroAddress, type Address, type Hex, type TransactionReceipt } from "viem";
import { sepolia } from "viem/chains";
import { registryAbi, resolverProfileAbi, SELLER_ROLES, factoryAbi } from "@/lib/ens/contracts";
import { EnsStorefrontService, EnsWriteError } from "@/services/ens-storefront";
import { ensConfig } from "@/lib/ens/config";

vi.mock("@/lib/ens/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ens/config")>();
  return { ...actual, ensConfig: { ...actual.ensConfig, parentName: "market.eth", subregistry: "0x3333333333333333333333333333333333333333" } };
});
const seller: Address = "0x1111111111111111111111111111111111111111";
const issuer: Address = "0x2222222222222222222222222222222222222222";
const registry: Address = "0x3333333333333333333333333333333333333333";
const resolver: Address = "0x4444444444444444444444444444444444444444";
const hash = `0x${"ab".repeat(32)}` as Hex;
const expiry = 1000n + 30n * 86400n;
const labelHash = keccak256(toBytes("alice"));

function fixture(options: { authorized?: boolean; occupied?: boolean; event?: boolean; forward?: typeof seller | typeof issuer; parentEmpty?: boolean } = {}) {
  let registered = false;
  const event = {
    address: registry,
    topics: encodeEventTopics({ abi: registryAbi, eventName: "LabelRegistered", args: { tokenId: 77n, labelHash, sender: issuer } }),
    data: encodeAbiParameters([{ type: "string" }, { type: "address" }, { type: "uint64" }], ["alice", seller, expiry]),
  };
  // Partial transaction fixtures are intentional: the service consumes status, block and logs only.
  const receipt = { status: "success", blockNumber: 100n, logs: options.event === false ? [] : [event] } as TransactionReceipt;
  const client = {
    readContract: vi.fn(), getBlockNumber: vi.fn().mockResolvedValue(100n),
    getBlock: vi.fn().mockResolvedValue({ timestamp: 1000n }), getCode: vi.fn().mockResolvedValue(undefined),
    simulateContract: vi.fn().mockImplementation(async (request) => ({ request })),
    waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt),
  } satisfies NonNullable<ConstructorParameters<typeof EnsStorefrontService>[0]>;
  const wallet = {
    account: { address: issuer, type: "json-rpc" as const }, chain: sepolia,
    writeContract: vi.fn().mockImplementation(async ({ functionName }) => { if (functionName === "register") registered = true; return hash; }),
  };
  client.readContract.mockImplementation(async ({ functionName, args, address }) => {
    if (functionName === "ROOT_REGISTRY") return ensConfig.rootRegistry;
    if (functionName === "getSubregistry") return args[0] === "eth" ? ensConfig.ethRegistry : options.parentEmpty ? zeroAddress : registry;
    if (functionName === "getState") {
      if (address === ensConfig.ethRegistry) return { status: 2, latestOwner: issuer, expiry: 9999999999n, tokenId: 66n, resource: 66n };
      return { status: registered || options.occupied ? 2 : 0, latestOwner: seller, expiry, tokenId: 77n, resource: 88n };
    }
    if (functionName === "hasRootRoles") return options.authorized ?? true;
    if (functionName === "verifyContract") return args[0] === registry ? ensConfig.userRegistryImplementation : ensConfig.resolverImplementation;
    if (functionName === "ownerOf") return seller;
    if (functionName === "resolve") return [encodeFunctionResult({ abi: resolverProfileAbi, functionName: "addr", result: options.forward ?? seller }), resolver];
    if (functionName === "predictProxyAddress") return resolver;
    throw new Error(`Unexpected method: ${functionName}`);
  });
  return { client, wallet, receipt, service: new EnsStorefrontService(client) };
}
const input = { label: "alice", seller, resolver, expirationDays: 30 };

describe("ENSv2 seller subnames", () => {
  it("issues a token to the seller, verifies the expected event and then ownership/forward resolution", async () => {
    const { service, client, wallet } = fixture();
    expect(await service.register(wallet, input)).toMatchObject({ name: "alice.market.eth", owner: seller, expiry, txHash: hash });
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
    expect(client.simulateContract).toHaveBeenCalledWith(expect.objectContaining({
      address: registry, functionName: "register", args: ["alice", seller, zeroAddress, resolver, SELLER_ROLES, expiry],
    }));
    expect(client.readContract.mock.calls.some(([call]) => call.functionName === "ownerOf")).toBe(true);
  });

  it.each([{ authorized: false }, { occupied: true }])("does not prompt for unauthorized or duplicate registrations: %j", async (options) => {
    const { service, wallet, client } = fixture(options);
    await expect(service.register(wallet, input)).rejects.toThrow();
    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(client.simulateContract).not.toHaveBeenCalled();
  });

  it("retains confirmed transaction evidence when the event is missing", async () => {
    const { service, wallet } = fixture({ event: false });
    await expect(service.register(wallet, input)).rejects.toMatchObject({ txHash: hash });
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
  });

  it("retains the hash when confirmed registration is not yet forward verified", async () => {
    const { service, wallet } = fixture({ forward: issuer });
    await expect(service.register(wallet, input)).rejects.toBeInstanceOf(EnsWriteError);
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
  });

  it("rejects forged event logs from a different registry", async () => {
    const { service, receipt } = fixture();
    receipt.logs[0].address = resolver;
    await expect(service.register(fixture().wallet, input)).rejects.toMatchObject({ txHash: hash });
  });

  it("does not let another wallet update a seller's profile or primary name", async () => {
    const { service, wallet } = fixture({ occupied: true });
    await expect(service.updateProfile(wallet, "alice", { avatar: "", description: "", url: "" })).rejects.toThrow("owner wallet");
    await expect(service.setPrimaryName(wallet, "alice")).rejects.toThrow("owner wallet");
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("refuses to replace a parent's existing subregistry", async () => {
    const { service, wallet } = fixture();
    await expect(service.attachParentRegistry(wallet, registry)).rejects.toThrow("already has a subregistry");
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("disallows unbounded or invalid lifetime before a write", async () => {
    const { service, wallet } = fixture();
    await expect(service.register(wallet, { ...input, expirationDays: 0 })).rejects.toThrow("1–365");
    await expect(service.register(wallet, { ...input, expirationDays: 366 })).rejects.toThrow("1–365");
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("keeps the submitted hash after a receipt timeout", async () => {
    const { service, client, wallet } = fixture();
    client.waitForTransactionReceipt.mockRejectedValue(new Error("timeout"));
    await expect(service.register(wallet, input)).rejects.toMatchObject({ txHash: hash });
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
  });

  it("verifies factory address, implementation, salt and event on resolver deployment", async () => {
    const { service, wallet, receipt } = fixture();
    receipt.logs = [{
      address: ensConfig.factory,
      topics: encodeEventTopics({ abi: factoryAbi, eventName: "ProxyDeployed", args: { sender: issuer, proxyAddress: resolver } }),
      data: encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [42n, ensConfig.resolverImplementation]),
    }] as TransactionReceipt["logs"];
    expect(await service.deploySellerResolver(wallet, "alice", seller, 42n)).toMatchObject({ address: resolver, txHash: hash });
  });
});
