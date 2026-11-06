import { MAX_CATALOGUE_MATCHES, CATALOGUE_READ_BUDGET_MS } from "../../shared/catalogue-limits";
import { resolveImageSource } from "../../shared/media";
import { categoryLabel } from "../../shared/categories";
import { hexToString } from "viem";
import { createPublicClient, defineSchema, str, addr, u64, bytes, type PublicArkivClient } from "@arkiv-network/sdk";
import { asc, eq } from "@arkiv-network/sdk/query";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, isAddressEqual } from "viem";

// Storefront B independently implements the public storage contract. No FreshMarket imports.
export const storefrontSchema = defineSchema("freshmarket.listings.v2", {
  seller: addr().indexed(), status: str().indexed(), visibility: str().indexed(), categoryPath: str().indexed(),
  brand: str().indexed(), model: str().indexed(), condition: str().indexed(), city: str().indexed(),
  fulfilment: str().indexed(), priceMinor: u64().indexed(), title: str(), description: bytes(), media: bytes(),
});
export interface PortableListing {
  imageUrl?: string; id: string; seller: string; title: string; priceMinor: bigint;
  city: string; category: string; condition: string; status: "available" | "reserved" | "sold"; expiresAtBlock: bigint;
}
function firstImage(media: `0x${string}`): string | undefined {
  try {
    const list: unknown = JSON.parse(hexToString(media));
    const first = Array.isArray(list) ? list.find((item) => typeof item === "string") : undefined;
    return typeof first === "string" ? resolveImageSource(first, import.meta.env?.VITE_SWARM_GATEWAY_URL) ?? undefined : undefined;
  } catch { return undefined; }
}
export function createReader(accessKey = "") {
  return createPublicClient({ chain: rabdi({ accessKey }), transport: http(undefined, { retryCount: 1, timeout: 15_000 }) });
}
/** truncated: the read limit stopped the scan, so a flood of public entities cannot blank this reader. */
export async function readCatalogue(client: PublicArkivClient): Promise<{ listings: PortableListing[]; block: bigint; truncated: boolean }> {
  const records = new Map<string, PortableListing>();
  const started = performance.now();
  let truncated = false;
  for (let offset = 0; ; offset += 100) {
    if (offset > MAX_CATALOGUE_MATCHES || performance.now() - started > CATALOGUE_READ_BUDGET_MS) { truncated = true; break; }
    // Unlisted listings are hidden from browse here too; they still exist publicly on Arkiv.
    const page = await client.select().from(storefrontSchema).where(eq("visibility", "public")).orderBy(asc("$key")).limit(offset === MAX_CATALOGUE_MATCHES ? 1 : 100).offset(offset).fetch();
    if (offset === MAX_CATALOGUE_MATCHES) {
      truncated = page.entities.length + page.skipped > 0;
      break;
    }
    for (const row of page.entities) {
      const status = row.status.value;
      if (!["available", "reserved", "sold"].includes(status) || !isAddressEqual(row.$owner, row.seller.value)) continue;
      records.set(row.$key, { imageUrl: firstImage(row.media.value), id: row.$key, seller: row.seller.value, title: row.title.value, priceMinor: row.priceMinor.value,
        city: row.city.value, category: categoryLabel(row.categoryPath.value), condition: row.condition.value, status: status as PortableListing["status"], expiresAtBlock: row.$expiresAt });
    }
    if (page.entities.length + page.skipped < 100) break;
  }
  const block = await client.getBlockNumber({ cacheTime: 0 });
  return { listings: [...records.values()].filter((row) => row.expiresAtBlock > block), block, truncated };
}
/** USDT minor units (6 decimals) with 2–6 fraction digits: 12_500_000n → "12.50 USDT". */
export function portablePrice(minor: bigint) {
  const fraction = (minor % 1_000_000n).toString().padStart(6, "0").replace(/0{1,4}$/, "");
  return `${new Intl.NumberFormat("en-US").format(minor / 1_000_000n)}.${fraction.padEnd(2, "0")} USDT`;
}
