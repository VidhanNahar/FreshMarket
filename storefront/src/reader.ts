import { resolveImageSource } from "../../shared/media";
import { hexToString } from "viem";
import { createPublicClient, defineSchema, str, addr, u64, bytes, type PublicArkivClient } from "@arkiv-network/sdk";
import { asc } from "@arkiv-network/sdk/query";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, isAddressEqual } from "viem";

// Storefront B independently implements the public storage contract. No FreshMarket imports.
export const storefrontSchema = defineSchema("freshmarket.listings", {
  seller: addr().indexed(), category: str().indexed(), status: str().indexed(), city: str().indexed(), priceMinor: u64().indexed(),
  title: str(), description: bytes(), imageUrl: bytes(), currency: str().default("INR"), createdAt: u64(),
});
export interface PortableListing {
  imageUrl?: string; id: string; seller: string; title: string; priceMinor: bigint; currency: string;
  city: string; category: string; status: "available" | "reserved" | "sold"; expiresAtBlock: bigint;
}
export function createReader(accessKey = "") {
  return createPublicClient({ chain: rabdi({ accessKey }), transport: http(undefined, { retryCount: 1, timeout: 15_000 }) });
}
export async function readCatalogue(client: PublicArkivClient): Promise<{ listings: PortableListing[]; block: bigint }> {
  const records = new Map<string, PortableListing>();
  for (let offset = 0; ; offset += 100) {
    const page = await client.select().from(storefrontSchema).orderBy(asc("$key")).limit(100).offset(offset).fetch();
    for (const row of page.entities) {
      const status = row.status.value;
      if (!["available", "reserved", "sold"].includes(status) || !isAddressEqual(row.$owner, row.seller.value)) continue;
      if (!/^[A-Z]{3}$/.test(row.currency.value) || new Intl.NumberFormat("en", { style: "currency", currency: row.currency.value }).resolvedOptions().maximumFractionDigits !== 2) continue;
      records.set(row.$key, { imageUrl: resolveImageSource(hexToString(row.imageUrl.value), import.meta.env?.VITE_SWARM_GATEWAY_URL) ?? undefined, id: row.$key, seller: row.seller.value, title: row.title.value, priceMinor: row.priceMinor.value,
        currency: row.currency.value, city: row.city.value, category: row.category.value, status: status as PortableListing["status"], expiresAtBlock: row.$expiresAt });
    }
    if (page.entities.length < 100) break;
  }
  const block = await client.getBlockNumber({ cacheTime: 0 });
  return { listings: [...records.values()].filter((row) => row.expiresAtBlock > block), block };
}
export function portablePrice(minor: bigint, currency: string) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .formatToParts(minor / 100n).map((part) => part.type === "fraction" ? (minor % 100n).toString().padStart(2, "0") : part.value).join("");
}
