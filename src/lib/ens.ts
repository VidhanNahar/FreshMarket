import { createPublicClient, http, isAddressEqual, type Address, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

/**
 * Seller names (`priya.freshmarket.eth`) and verified badges (`priya.verified.freshmarket.eth`)
 * live in FreshMarket's ENSv2 subname registries on Sepolia. A name is trusted only when
 * forward resolution returns the expected wallet; an Arkiv record claiming it proves nothing.
 */
export const ENS_PARENT_NAME = process.env.NEXT_PUBLIC_ENS_PARENT_NAME || "freshmarket.eth";
// ENSv2 Universal Resolver proxy on Sepolia (docs.ens.domains/learn/deployments).
export const ENS_UNIVERSAL_RESOLVER: Address = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";

const LABEL = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export type EnsReader = Pick<PublicClient, "getEnsAddress">;

let reader: EnsReader | undefined;
export function getEnsReader(): EnsReader {
  reader ??= createPublicClient({ chain: sepolia, transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined) });
  return reader;
}

/** "priya.freshmarket.eth" → "priya"; null for any name outside FreshMarket's registry. */
export function sellerLabel(ensName: string): string | null {
  const suffix = `.${ENS_PARENT_NAME}`;
  if (!ensName.endsWith(suffix)) return null;
  const label = ensName.slice(0, -suffix.length);
  return LABEL.test(label) ? label : null;
}

export function sellerEnsName(label: string): string {
  return `${label}.${ENS_PARENT_NAME}`;
}

export function verifiedBadgeName(label: string): string {
  return `${label}.verified.${ENS_PARENT_NAME}`;
}

/** Whether `name` currently resolves to `wallet`. RPC failures propagate rather than reading as "no". */
export async function ensResolvesTo(name: string, wallet: Address, client: EnsReader = getEnsReader()): Promise<boolean> {
  const resolved = await client.getEnsAddress({ name: normalize(name), universalResolverAddress: ENS_UNIVERSAL_RESOLVER });
  return Boolean(resolved && isAddressEqual(resolved, wallet));
}

/** A seller is verified only while FreshMarket's badge name exists and points at their wallet. */
export function hasVerifiedBadge(ensName: string, wallet: Address, client: EnsReader = getEnsReader()): Promise<boolean> {
  const label = sellerLabel(ensName);
  return label ? ensResolvesTo(verifiedBadgeName(label), wallet, client) : Promise.resolve(false);
}
