import { describe, expect, it, vi } from "vitest";
import {
  ContractFunctionExecutionError, ContractFunctionRevertedError, decodeFunctionData, encodeAbiParameters, encodeErrorResult,
  encodeEventTopics, encodeFunctionResult, zeroAddress, type Address, type Hex, type Log,
} from "viem";
import { sepolia } from "viem/chains";
import { ensConfig } from "@/lib/ens/config";
import { permissionedResolverAbi, resolverProfileAbi, ROLE_SET_TEXT, textResource } from "@/lib/ens/contracts";
import { EnsDelegationService, EnsUnauthorizedError } from "@/services/ens-delegation";

const owner: Address = "0x1111111111111111111111111111111111111111";
const manager: Address = "0x2222222222222222222222222222222222222222";
const registry: Address = "0x3333333333333333333333333333333333333333";
const resolver: Address = "0x4444444444444444444444444444444444444444";
const hash = `0x${"cd".repeat(32)}` as Hex;
const NAME = "alice.market.eth";

function unauthorized(functionName: string) {
  const data = encodeErrorResult({ abi: permissionedResolverAbi, errorName: "EACUnauthorizedAccountRoles", args: [textResource("url"), ROLE_SET_TEXT, manager] });
  const reverted = new ContractFunctionRevertedError({ abi: permissionedResolverAbi, data, functionName });
  return new ContractFunctionExecutionError(reverted, { abi: permissionedResolverAbi, functionName, args: ["0x", "url", ""], contractAddress: resolver });
}
function rolesLog(account: Address, resource: bigint, block: bigint): Log {
  return {
    address: resolver, blockNumber: block, logIndex: 0, transactionIndex: 0, removed: false, blockHash: hash, transactionHash: hash,
    topics: encodeEventTopics({ abi: permissionedResolverAbi, eventName: "EACRolesChanged", args: { resource, account } }) as Log["topics"],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [0n, ROLE_SET_TEXT]),
  };
}
function initializedLog(block: bigint): Log {
  return {
    address: resolver, blockNumber: block, logIndex: 1, transactionIndex: 0, removed: false, blockHash: hash, transactionHash: hash,
    topics: encodeEventTopics({ abi: permissionedResolverAbi, eventName: "Initialized" }) as Log["topics"],
    data: encodeAbiParameters([{ type: "uint64" }], [1n]),
  };
}

function fixture(options: { admin?: boolean; implementation?: Address; roles?: Record<string, bigint>; simulateError?: Error; stored?: string; logs?: Log[][] } = {}) {
  const roles = { ...options.roles };
  const client = {
    getBlockNumber: vi.fn().mockResolvedValue(200_000n),
    getBlock: vi.fn(), getCode: vi.fn(),
    getLogs: vi.fn().mockImplementation(async () => options.logs?.shift() ?? []),
    simulateContract: vi.fn().mockImplementation(async (request) => { if (options.simulateError) throw options.simulateError; return { request }; }),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", blockNumber: 201n, logs: [] }),
    readContract: vi.fn().mockImplementation(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
      if (functionName === "getSubregistry") return args[0] === "eth" ? ensConfig.ethRegistry : registry;
      if (functionName === "getResolver") return resolver;
      if (functionName === "verifyContract") return options.implementation ?? ensConfig.resolverImplementation;
      if (functionName === "hasRootRoles") return options.admin ?? true;
      if (functionName === "roles") return roles[`${args[0]}:${String(args[1]).toLowerCase()}`] ?? 0n;
      if (functionName === "hasRoles") return Boolean((roles[`${args[0]}:${String(args[2]).toLowerCase()}`] ?? 0n) & ROLE_SET_TEXT);
      if (functionName === "resolve") return encodeFunctionResult({ abi: resolverProfileAbi, functionName: "text", result: options.stored ?? "" });
      throw new Error(`Unexpected ${functionName}`);
    }),
  };
  const wallet = {
    account: { address: owner, type: "json-rpc" as const }, chain: sepolia,
    writeContract: vi.fn().mockImplementation(async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
      // Model the resolver's state change so read-back verification sees it.
      if (functionName === "grantSetterRoles") {
        const { args: setter } = decodeFunctionData({ abi: permissionedResolverAbi, data: args[0] as Hex });
        roles[`${textResource(setter![1] as string)}:${String(args[1]).toLowerCase()}`] = ROLE_SET_TEXT;
      }
      if (functionName === "revokeRoles") roles[`${args[0]}:${String(args[2]).toLowerCase()}`] = 0n;
      return hash;
    }),
  };
  return { client, wallet, service: new EnsDelegationService(client as unknown as ConstructorParameters<typeof EnsDelegationService>[0]) };
}
const key = (k: string, account: Address) => `${textResource(k)}:${account.toLowerCase()}`;

describe("ENSv2 key-scoped storefront delegation", () => {
  it("grants exactly one text key through grantSetterRoles and verifies the role afterwards", async () => {
    const { service, wallet } = fixture();
    await expect(service.grantTextDelegate(wallet, NAME, "freshmarket.contact", manager)).resolves.toMatchObject({ txHash: hash, blockNumber: 201n });
    const request = wallet.writeContract.mock.calls[0][0];
    expect(request).toMatchObject({ address: resolver, functionName: "grantSetterRoles" });
    const setter = decodeFunctionData({ abi: permissionedResolverAbi, data: request.args[0] });
    expect(setter.functionName).toBe("setText");
    expect(setter.args?.[1]).toBe("freshmarket.contact");
    expect(request.args[1]).toBe(manager);
  });

  it("refuses non-delegable keys, self-delegation and owners without delegation admin before signing", async () => {
    const { service, wallet } = fixture();
    await expect(service.grantTextDelegate(wallet, NAME, "contenthash", manager)).rejects.toThrow("Only these storefront keys");
    await expect(service.grantTextDelegate(wallet, NAME, "url", owner)).rejects.toThrow("different delegate");
    const noAdmin = fixture({ admin: false });
    await expect(noAdmin.service.grantTextDelegate(noAdmin.wallet, NAME, "url", manager)).rejects.toThrow("cannot delegate");
    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(noAdmin.wallet.writeContract).not.toHaveBeenCalled();
  });

  it("refuses names that do not use a factory-verified PermissionedResolver", async () => {
    const { service } = fixture({ implementation: zeroAddress });
    await expect(service.readStorefront(NAME)).rejects.toThrow("dedicated ENSv2 PermissionedResolver");
  });

  it("revokes with the key's resource and ROLE_SET_TEXT, then confirms the role is gone", async () => {
    const { service, wallet } = fixture({ roles: { [key("url", manager)]: ROLE_SET_TEXT } });
    await service.revokeTextDelegate(wallet, NAME, "url", manager);
    expect(wallet.writeContract.mock.calls[0][0]).toMatchObject({ functionName: "revokeRoles", args: [textResource("url"), ROLE_SET_TEXT, manager] });
  });

  it("turns the resolver's EACUnauthorizedAccountRoles revert into a clear error without broadcasting", async () => {
    const { service, wallet } = fixture({ simulateError: unauthorized("setText") });
    const attempt = service.setStorefrontText(wallet, NAME, "url", "https://shop.example");
    await expect(attempt).rejects.toBeInstanceOf(EnsUnauthorizedError);
    await expect(attempt).rejects.toThrow("no permission");
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("reports an unauthorized wallet from a read-only permission check", async () => {
    const denied = fixture({ simulateError: unauthorized("setText") });
    expect(await denied.service.checkTextEdit(NAME, "url", manager)).toMatchObject({ allowed: false, reason: expect.stringContaining("EACUnauthorizedAccountRoles") });
    const allowed = fixture();
    expect(await allowed.service.checkTextEdit(NAME, "url", manager)).toMatchObject({ allowed: true });
  });

  it("validates URL keys and verifies the stored value after an edit", async () => {
    const { service, wallet } = fixture({ stored: "hello" });
    await expect(service.setStorefrontText(wallet, NAME, "avatar", "javascript:alert(1)")).rejects.toThrow("HTTPS");
    await expect(service.setStorefrontText(wallet, NAME, "freshmarket.description", "hello")).resolves.toMatchObject({ txHash: hash });
    await expect(service.setStorefrontText(wallet, NAME, "freshmarket.description", "different")).rejects.toThrow("not readable yet");
  });

  it("lists only delegates whose role is confirmed by a live roles() read and stops at initialization", async () => {
    const stale: Address = "0x5555555555555555555555555555555555555555";
    const { service, client } = fixture({
      roles: { [key("freshmarket.contact", manager)]: ROLE_SET_TEXT },
      logs: [[rolesLog(manager, textResource("freshmarket.contact"), 190_000n)], [rolesLog(stale, textResource("url"), 150_000n), initializedLog(150_000n)], [rolesLog(owner, 1n, 1n)]],
    });
    expect(await service.listDelegates(resolver)).toEqual([{ account: manager, key: "freshmarket.contact" }]);
    expect(client.getLogs).toHaveBeenCalledTimes(2);
  });
});
