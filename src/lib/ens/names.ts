import { keccak256, toBytes, toHex, zeroAddress, getAddress, type Address } from "viem";
import { normalize, packetToBytes } from "viem/ens";

export function storefrontLabel(input: string): string {
  const label = normalize(input.trim());
  // Restrict newly issued marketplace handles to readable ASCII; existing ENS identity reads
  // still use ENSIP-15 normalization and may include valid internationalized names.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(label)) throw new Error("Use 1–32 lowercase letters, digits or internal hyphens for your storefront handle");
  return label;
}
export function labelId(label: string): bigint { return BigInt(keccak256(toBytes(label))); }
export function dnsName(name: string) { return toHex(packetToBytes(normalize(name))); }
export function sellerAddress(value: string): Address {
  const result = getAddress(value);
  if (result === zeroAddress) throw new Error("A non-zero seller wallet address is required");
  return result;
}

/** Identity metadata must not become javascript:/data: links or arbitrary embedded SVG. */
export function publicHttpsUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
