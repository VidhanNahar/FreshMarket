import { getAddress, zeroAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import deployment from "../../../shared/ens-deployment.json";

/** Only public Sepolia endpoints/addresses belong here; never put signer secrets in env. */
const configurationErrors: string[] = [];
function address(value: string | undefined, fallback: string): Address {
  try { return getAddress(value?.trim() || fallback); }
  catch { configurationErrors.push("Invalid ENS contract address"); return getAddress(fallback); }
}
function parentName(value: string | undefined) {
  try { return value?.trim() ? normalize(value.trim()) : ""; }
  catch { configurationErrors.push("Invalid ENS parent name"); return ""; }
}
function rpcUrl(value: string | undefined) {
  const fallback = "https://ethereum-sepolia-rpc.publicnode.com";
  try {
    const url = new URL(value?.trim() || fallback);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.href;
  } catch { configurationErrors.push("Invalid Sepolia RPC URL"); return fallback; }
}

export const ENS_SEPOLIA_CHAIN_ID = 11155111;
export const ensConfig = {
  rpcUrl: rpcUrl(process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL),
  rootRegistry: address(process.env.NEXT_PUBLIC_ENS_ROOT_REGISTRY_ADDRESS, deployment.rootRegistry),
  ethRegistry: address(process.env.NEXT_PUBLIC_ENS_ETH_REGISTRY_ADDRESS, deployment.ethRegistry),
  // Pin the ENSv2 resolver that demonstrably serves this root. The shared canonical proxy
  // is mutable and did not answer ROOT_REGISTRY in the live compatibility check.
  universalResolver: address(process.env.NEXT_PUBLIC_ENS_UNIVERSAL_RESOLVER_ADDRESS, deployment.universalResolver),
  factory: address(process.env.NEXT_PUBLIC_ENS_FACTORY_ADDRESS, deployment.factory),
  userRegistryImplementation: address(process.env.NEXT_PUBLIC_ENS_USER_REGISTRY_IMPLEMENTATION, deployment.userRegistryImplementation),
  resolverImplementation: address(process.env.NEXT_PUBLIC_ENS_RESOLVER_IMPLEMENTATION, deployment.permissionedResolverImplementation),
  reverseRegistrar: address(process.env.NEXT_PUBLIC_ENS_REVERSE_REGISTRAR_ADDRESS, deployment.reverseRegistrar),
  // No project-controlled parent is assumed. Missing parent configuration disables registration.
  parentName: parentName(process.env.NEXT_PUBLIC_ENS_PARENT_NAME),
  subregistry: address(process.env.NEXT_PUBLIC_ENS_SUBREGISTRY_ADDRESS, zeroAddress),
};

// Bad optional ENS configuration fails ENS operations, never the marketplace module import.
export const ensConfigurationError = configurationErrors.join("; ") || null;
