import { decodeFunctionResult, encodeFunctionData, getAddress, isAddressEqual, namehash, zeroAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import { ensPublicClient } from "@/lib/ens/client";
import { ensConfig, ensConfigurationError } from "@/lib/ens/config";
import { registryAbi, resolverProfileAbi, universalResolverAbi } from "@/lib/ens/contracts";
import { dnsName, labelId, publicHttpsUrl, sellerAddress } from "@/lib/ens/names";

export interface SellerIdentity {
  address: Address;
  name: string;
  avatar: string | null;
  description: string | null;
  url: string | null;
  verifiedAtBlock: bigint;
}
export type EnsReader = Pick<typeof ensPublicClient, "readContract" | "getBlockNumber" | "getCode" | "getBlock">;

/** Resolves the hierarchy instead of treating ENSv2 as the legacy flat ENSv1 registry. */
export async function findNameRegistry(name: string, client: EnsReader = ensPublicClient, blockNumber?: bigint) {
  const labels = normalize(name).split(".").reverse();
  if (!labels.length || labels.length > 10) throw new Error("Unsupported ENS name depth");
  let registry = ensConfig.rootRegistry;
  for (const label of labels.slice(0, -1)) {
    registry = await client.readContract({ address: registry, abi: registryAbi, functionName: "getSubregistry", args: [label], blockNumber });
    if (registry === zeroAddress) return null;
  }
  return { registry, label: labels.at(-1)! };
}

export async function resolveForwardAddress(name: string, client: EnsReader = ensPublicClient, blockNumber?: bigint): Promise<Address | null> {
  const normalized = normalize(name);
  const [data] = await client.readContract({
    address: ensConfig.universalResolver, abi: universalResolverAbi, functionName: "resolve",
    args: [dnsName(normalized), encodeFunctionData({ abi: resolverProfileAbi, functionName: "addr", args: [namehash(normalized)] })], blockNumber,
  });
  if (data === "0x") return null;
  const address = decodeFunctionResult({ abi: resolverProfileAbi, functionName: "addr", data });
  return address === zeroAddress ? null : getAddress(address);
}

async function textRecord(name: string, key: string, client: EnsReader, blockNumber: bigint): Promise<string | null> {
  try {
    const [data] = await client.readContract({
      address: ensConfig.universalResolver, abi: universalResolverAbi, functionName: "resolve",
      args: [dnsName(name), encodeFunctionData({ abi: resolverProfileAbi, functionName: "text", args: [namehash(name), key] })], blockNumber,
    });
    if (data === "0x") return null;
    return decodeFunctionResult({ abi: resolverProfileAbi, functionName: "text", data }).slice(0, 2000) || null;
  } catch { return null; } // Optional metadata cannot invalidate otherwise verified identity.
}

/**
 * Reverse records are merely claims. Verify BOTH current token ownership and the forward
 * address at a single block before returning a name for a verified badge. An ENS name does
 * not prove seller reputation or endorsement; it only links this testnet name to the wallet.
 */
export async function resolveSellerIdentity(address: Address, client: EnsReader = ensPublicClient): Promise<SellerIdentity | null> {
  if (ensConfigurationError) throw new Error(ensConfigurationError);
  const seller = sellerAddress(address);
  const blockNumber = await client.getBlockNumber();
  const resolverRoot = await client.readContract({ address: ensConfig.universalResolver, abi: universalResolverAbi, functionName: "ROOT_REGISTRY", blockNumber });
  if (!isAddressEqual(resolverRoot, ensConfig.rootRegistry)) throw new Error("ENS resolver and registry deployments do not match");
  const [candidate] = await client.readContract({
    address: ensConfig.universalResolver, abi: universalResolverAbi, functionName: "reverse", args: [seller, 60n], blockNumber,
  });
  if (!candidate || candidate.length > 255) return null;
  let name: string;
  try { name = normalize(candidate); } catch { return null; }
  const location = await findNameRegistry(name, client, blockNumber);
  if (!location) return null;
  const state = await client.readContract({ address: location.registry, abi: registryAbi, functionName: "getState", args: [labelId(location.label)], blockNumber });
  if (state.status !== 2) return null; // AVAILABLE=0, RESERVED=1, REGISTERED=2.
  const owner = await client.readContract({ address: location.registry, abi: registryAbi, functionName: "ownerOf", args: [state.tokenId], blockNumber });
  if (!isAddressEqual(owner, seller)) return null;
  const forward = await resolveForwardAddress(name, client, blockNumber);
  if (!forward || !isAddressEqual(forward, seller)) return null;
  const [avatar, description, url] = await Promise.all([
    textRecord(name, "avatar", client, blockNumber), textRecord(name, "description", client, blockNumber), textRecord(name, "url", client, blockNumber),
  ]);
  return { address: seller, name, avatar: publicHttpsUrl(avatar), description, url: publicHttpsUrl(url), verifiedAtBlock: blockNumber };
}
