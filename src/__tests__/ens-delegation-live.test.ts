import { describe, expect, it } from "vitest";
import { createPublicClient, decodeFunctionResult, encodeFunctionData, http, namehash, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { ensConfig } from "@/lib/ens/config";
import { factoryAbi, permissionedResolverAbi, resolverProfileAbi, RESOLVER_SELLER_ROLES, ROLE_SET_TEXT_ADMIN } from "@/lib/ens/contracts";
import { dnsName } from "@/lib/ens/names";
import { grantTextDelegateCall, revokeTextDelegateCall, setTextCall } from "@/services/ens-delegation";
import { sellerResolverInitData } from "@/services/ens-storefront";

/**
 * Issue #30 acceptance sequence against the REAL deployed ENSv2 PermissionedResolver implementation and
 * VerifiableFactory on Ethereum Sepolia, executed with eth_simulateV1: state carries across calls in the
 * simulated block, nothing is signed or broadcast, and no keys or test ETH are needed.
 *
 *   grant → permitted edit → unauthorized edit fails → out-of-scope key fails → revoke → post-revoke edit fails
 *
 * Run with: ENS_LIVE_TESTS=1 npx vitest run src/__tests__/ens-delegation-live.test.ts
 */
const UNAUTHORIZED = "0x4b27a133"; // EACUnauthorizedAccountRoles(uint256,uint256,address)
const CANNOT_GRANT = "0xd1a3b355"; // EACCannotGrantRoles(uint256,uint256,address)
const owner: Address = "0x1000000000000000000000000000000000000f01";
const manager: Address = "0x2000000000000000000000000000000000000f02";
const stranger: Address = "0x3000000000000000000000000000000000000f03";
const name = "alice.freshmarket-test.eth";
const key = "freshmarket.description";

type Call = { abi: typeof permissionedResolverAbi; functionName: string; args: readonly unknown[] };
const tx = (from: Address, to: Address, call: Call) => ({ from, to, data: encodeFunctionData(call as Parameters<typeof encodeFunctionData>[0]) });
const readText = (to: Address) => ({
  from: owner, to,
  data: encodeFunctionData({ abi: permissionedResolverAbi, functionName: "resolve", args: [dnsName(name), encodeFunctionData({ abi: resolverProfileAbi, functionName: "text", args: [namehash(name), key] })] }),
});

describe.skipIf(!process.env.ENS_LIVE_TESTS)("live Sepolia ENSv2 key-scoped delegation (eth_simulateV1)", () => {
  const client = createPublicClient({ chain: sepolia, transport: http(ensConfig.rpcUrl, { timeout: 20_000 }) });

  async function freshResolver(roles: bigint) {
    const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const proxy = await client.readContract({ address: ensConfig.factory, abi: factoryAbi, functionName: "predictProxyAddress", args: [owner, salt] });
    const init = encodeFunctionData({ abi: permissionedResolverAbi, functionName: "initialize", args: [[{ account: owner, roleBitmap: roles }], []] });
    return { proxy, deploy: { from: owner, to: ensConfig.factory, data: encodeFunctionData({ abi: factoryAbi, functionName: "deployProxy", args: [ensConfig.resolverImplementation, salt, init] }) } };
  }
  const selector = (data: Hex | undefined) => data?.slice(0, 10);

  it("enforces grant → edit → unauthorized → revoke → rejected on the real resolver", async () => {
    const salt = BigInt(Date.now());
    const proxy = await client.readContract({ address: ensConfig.factory, abi: factoryAbi, functionName: "predictProxyAddress", args: [owner, salt] });
    const [block] = await client.simulateBlocks({ blocks: [{ calls: [
      // The exact initialize() payload the app sends when preparing a seller resolver.
      { from: owner, to: ensConfig.factory, data: encodeFunctionData({ abi: factoryAbi, functionName: "deployProxy", args: [ensConfig.resolverImplementation, salt, sellerResolverInitData(name, owner)] }) },
      tx(owner, proxy, grantTextDelegateCall(name, key, manager)),
      tx(manager, proxy, setTextCall(name, key, "Managed by the inventory bot")),
      readText(proxy),
      tx(stranger, proxy, setTextCall(name, key, "defaced")),
      tx(manager, proxy, setTextCall(name, "url", "https://evil.example")),
      tx(owner, proxy, revokeTextDelegateCall(key, manager)),
      tx(manager, proxy, setTextCall(name, key, "after revocation")),
      readText(proxy),
    ] }] });
    const [deploy, grant, managerEdit, afterEdit, strangerEdit, outOfScope, revoke, afterRevoke, finalText] = block.calls;
    expect(deploy.status).toBe("success");
    expect(grant.status).toBe("success");
    expect(managerEdit.status).toBe("success");
    expect(decodeFunctionResult({ abi: resolverProfileAbi, functionName: "text", data: decodeFunctionResult({ abi: permissionedResolverAbi, functionName: "resolve", data: afterEdit.data }) })).toBe("Managed by the inventory bot");
    expect(strangerEdit.status).toBe("failure");
    expect(selector(strangerEdit.data)).toBe(UNAUTHORIZED);
    expect(outOfScope.status).toBe("failure");
    expect(selector(outOfScope.data)).toBe(UNAUTHORIZED);
    expect(revoke.status).toBe("success");
    expect(afterRevoke.status).toBe("failure");
    expect(selector(afterRevoke.data)).toBe(UNAUTHORIZED);
    // The revoked manager's attempt left the record untouched.
    expect(decodeFunctionResult({ abi: resolverProfileAbi, functionName: "text", data: decodeFunctionResult({ abi: permissionedResolverAbi, functionName: "resolve", data: finalText.data }) })).toBe("Managed by the inventory bot");
  }, 60_000);

  it("rejects delegation from a resolver owner without ROLE_SET_TEXT_ADMIN", async () => {
    const { proxy, deploy } = await freshResolver(RESOLVER_SELLER_ROLES & ~ROLE_SET_TEXT_ADMIN);
    const [block] = await client.simulateBlocks({ blocks: [{ calls: [deploy, tx(owner, proxy, grantTextDelegateCall(name, key, manager))] }] });
    expect(block.calls[0].status).toBe("success");
    expect(block.calls[1].status).toBe("failure");
    expect(selector(block.calls[1].data)).toBe(CANNOT_GRANT);
  }, 60_000);

  it("keeps a delegate from granting itself further keys or revoking the owner", async () => {
    const { proxy, deploy } = await freshResolver(RESOLVER_SELLER_ROLES);
    const [block] = await client.simulateBlocks({ blocks: [{ calls: [
      deploy,
      tx(owner, proxy, grantTextDelegateCall(name, key, manager)),
      tx(manager, proxy, grantTextDelegateCall(name, "url", stranger)),
      tx(manager, proxy, revokeTextDelegateCall(key, owner)),
    ] }] });
    expect(block.calls.slice(0, 2).map((call) => call.status)).toEqual(["success", "success"]);
    expect(block.calls[2].status).toBe("failure");
    expect(block.calls[3].status).toBe("failure");
  }, 60_000);
});
