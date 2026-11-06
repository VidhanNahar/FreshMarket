import { describe, expect, it, vi } from "vitest";
import { createPublicClient } from "@arkiv-network/sdk";
import { custom, stringToHex } from "viem";
import { rabdiReadChain } from "@/lib/arkiv/chain";
import { ArkivListingRepository } from "@/services/listing-repository";
import { readCatalogue, portablePrice } from "../../storefront/src/reader";

const key = `0x${"ab".repeat(32)}`;
const seller = "0x1111111111111111111111111111111111111111";
function entity(status = "available", price = "0x1388") {
  return { key, owner: seller, creator: seller, createdAt: "0x64", updatedAt: "0x64", expiresAt: "0x96", creationFlags: 0, attributes: [
    { name: "arkiv.schema", type: "str", value: "freshmarket.listings" },
    { name: "seller", type: "addr", value: seller }, { name: "category", type: "str", value: "Electronics" },
    { name: "city", type: "str", value: "Mumbai" }, { name: "status", type: "str", value: status },
    { name: "priceMinor", type: "u64", value: price }, { name: "currency", type: "str", value: "INR" },
    { name: "title", type: "str", value: "Portable laptop" }, { name: "description", type: "bytes", value: stringToHex("Test laptop description") },
    { name: "imageUrl", type: "bytes", value: stringToHex("https://example.com/laptop.png") },
    { name: "createdAt", type: "u64", value: "0x18bcfe56800" },
  ] };
}

describe("two independent storefront readers", () => {
  it("preserves the stored Swarm reference and resolves it independently for media rendering", async () => {
    const record = entity();
    record.attributes.find((attribute) => attribute.name === "imageUrl")!.value = stringToHex(`bzz://${"ab".repeat(32)}`);
    const request = vi.fn(async ({ method }: { method: string }) => method === "eth_blockNumber" ? "0x64" : { data: [record], blockNumber: "0x64" });
    const a = new ArkivListingRepository(createPublicClient({ chain: rabdiReadChain, transport: custom({ request }, { retryCount: 0 }) }));
    const b = createPublicClient({ chain: rabdiReadChain, transport: custom({ request }, { retryCount: 0 }) });
    expect((await a.searchAll())[0].imageUrl).toBe(`bzz://${"ab".repeat(32)}`);
    expect((await readCatalogue(b)).listings[0].imageUrl).toContain(`/bzz/${"ab".repeat(32)}/`);
  });

  it("reads identical keys and reflects price/status changes and expiry on refresh", async () => {
    let status = "available";
    let price = "0x1388";
    let block = "0x64";
    const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_blockNumber") return block;
      if (method !== "arkiv_query") throw new Error("Unexpected RPC");
      const filtered = String(params?.[0]).includes("status = str('available')") && status !== "available";
      return { data: filtered || block === "0x96" ? [] : [entity(status, price)], blockNumber: block };
    });
    // Independent transports and clients; only their public onchain source is shared.
    const a = new ArkivListingRepository(createPublicClient({ chain: rabdiReadChain, transport: custom({ request }, { retryCount: 0 }) }));
    const b = createPublicClient({ chain: rabdiReadChain, transport: custom({ request }, { retryCount: 0 }) });
    expect((await a.searchAll())[0].id).toBe((await readCatalogue(b)).listings[0].id);
    price = "0x2710";
    expect((await a.searchAll())[0].priceMinor).toBe(10000n);
    expect((await readCatalogue(b)).listings[0].priceMinor).toBe(10000n);
    status = "reserved";
    expect(await a.searchAll()).toEqual([]);
    expect((await readCatalogue(b)).listings[0].status).toBe("reserved");
    status = "sold";
    expect((await readCatalogue(b)).listings[0].status).toBe("sold");
    block = "0x96";
    expect((await readCatalogue(b)).listings).toEqual([]);
    expect(await a.searchAll()).toEqual([]);
    expect(portablePrice(10001n, "INR")).toBe("₹100.01");
  });
  it("rejects forged sellers and prunes expired cached rows using the confirmed block", async () => {
    const forged = entity(); forged.owner = "0x2222222222222222222222222222222222222222";
    const request = vi.fn(async ({ method }: { method: string }) => method === "eth_blockNumber" ? "0x96" : { data: [forged, entity()], blockNumber: "0x96" });
    const client = createPublicClient({ chain: rabdiReadChain, transport: custom({ request }, { retryCount: 0 }) });
    expect((await readCatalogue(client)).listings).toEqual([]);
  });
});
