import { describe, expect, it, vi } from "vitest";
import { ExpirationTime, createPublicClient } from "@arkiv-network/sdk";
import { custom, stringToHex, type Address, type Hex } from "viem";
import { rabdiWalletChain } from "@/lib/arkiv/chain";
import { reviewSchema, sellerSchema } from "@/lib/arkiv/schema";
import { hasVerifiedBadge, sellerLabel, verifiedBadgeName, type EnsReader } from "@/lib/ens";
import { ArkivSellerRepository, SELLER_PROFILE_DAYS } from "@/services/seller-repository";
import {
  ArkivReviewRepository, REVIEW_DAYS, orderAllowsReview, summarizeReviews, type OrderLookup, type PurchaseOrder,
} from "@/services/review-repository";

const seller: Address = "0x1111111111111111111111111111111111111111";
const buyer: Address = "0x2222222222222222222222222222222222222222";
const key = `0x${"ab".repeat(32)}` as Hex;

function wallet(address: Address) {
  return {
    account: { address, type: "json-rpc" as const },
    chain: rabdiWalletChain,
    createEntity: vi.fn().mockResolvedValue({ entityKey: key, txHash: key, expiresAt: 1n }),
  };
}
function ens(resolved: Record<string, Address | null>): EnsReader {
  return { getEnsAddress: vi.fn(async ({ name }: { name: string }) => resolved[name] ?? null) } as unknown as EnsReader;
}
function reader(rows: unknown[]) {
  const request = vi.fn().mockResolvedValue({ data: rows, blockNumber: "0x64" });
  return { request, client: createPublicClient({ chain: rabdiWalletChain, transport: custom({ request }, { retryCount: 0 }) }) };
}
function sellerRow(owner: Address, ensName: string, updatedAt = "0x64") {
  return { key, owner, creator: owner, createdAt: "0x1", updatedAt, expiresAt: "0x49da4", creationFlags: 0, attributes: [
    { name: "arkiv.schema", type: "str", value: "freshmarket.sellers" },
    { name: "ensName", type: "str", value: ensName }, { name: "sellerType", type: "str", value: "business" },
  ] };
}
function reviewRow(owner: Address, orderId: string, rating = "0x5", updatedAt = "0x64") {
  return { key, owner, creator: owner, createdAt: "0x1", updatedAt, expiresAt: "0x49da4", creationFlags: 0, attributes: [
    { name: "arkiv.schema", type: "str", value: "freshmarket.reviews" },
    { name: "seller", type: "addr", value: seller }, { name: "orderId", type: "u64", value: orderId },
    { name: "sellerRating", type: "u64", value: rating }, { name: "itemRating", type: "u64", value: "0x4" },
    { name: "text", type: "bytes", value: stringToHex("Smooth handover") },
  ] };
}

describe("ENS names", () => {
  it("accepts only FreshMarket subnames", () => {
    expect(sellerLabel("priya.freshmarket.eth")).toBe("priya");
    expect(sellerLabel("priya.eth")).toBeNull();
    expect(sellerLabel("a.b.freshmarket.eth")).toBeNull();
    expect(verifiedBadgeName("priya")).toBe("priya.verified.freshmarket.eth");
  });
  it("shows a badge only while the badge name resolves to the seller's wallet", async () => {
    expect(await hasVerifiedBadge("priya.freshmarket.eth", seller, ens({ "priya.verified.freshmarket.eth": seller }))).toBe(true);
    expect(await hasVerifiedBadge("priya.freshmarket.eth", seller, ens({ "priya.verified.freshmarket.eth": buyer }))).toBe(false);
    expect(await hasVerifiedBadge("priya.freshmarket.eth", seller, ens({}))).toBe(false);
  });
});

describe("seller directory", () => {
  it("publishes only names that already resolve to the connected wallet", async () => {
    const client = wallet(seller);
    const repository = new ArkivSellerRepository(undefined, ens({ "priya.freshmarket.eth": seller }));
    await repository.publish({ ensName: " Priya.FreshMarket.eth ", sellerType: "individual" }, client);
    const [schema, values, options] = client.createEntity.mock.calls[0];
    expect(schema).toBe(sellerSchema);
    expect(values.ensName.value).toBe("priya.freshmarket.eth");
    expect(options.expiration).toEqual(ExpirationTime.fromDays(SELLER_PROFILE_DAYS));
    await expect(repository.publish({ ensName: "arjun.freshmarket.eth", sellerType: "individual" }, client)).rejects.toThrow("does not resolve");
    await expect(repository.publish({ ensName: "priya.eth", sellerType: "individual" }, client)).rejects.toThrow("FreshMarket name");
    expect(client.createEntity).toHaveBeenCalledOnce();
  });
  it("ignores directory entries whose ENS name points at another wallet", async () => {
    const { client, request } = reader([sellerRow(buyer, "priya.freshmarket.eth"), sellerRow(seller, "priya.freshmarket.eth")]);
    const repository = new ArkivSellerRepository(client, ens({ "priya.freshmarket.eth": seller }));
    expect((await repository.findByEnsName("priya.freshmarket.eth"))?.owner).toBe(seller);
    expect(request.mock.calls[0][0].params[0]).toContain("ensName = str('priya.freshmarket.eth')");
  });
});

describe("reviews", () => {
  const settled: PurchaseOrder = { buyer, seller, state: "Released" };
  const orders = (order: PurchaseOrder | null): OrderLookup => ({ getOrder: vi.fn().mockResolvedValue(order) });

  it("allows reviews for released or refunded orders by their buyer only", () => {
    expect(orderAllowsReview(settled, buyer, seller)).toBe(true);
    expect(orderAllowsReview({ ...settled, state: "Refunded" }, buyer, seller)).toBe(true);
    expect(orderAllowsReview({ ...settled, state: "Paid" }, buyer, seller)).toBe(false);
    expect(orderAllowsReview(settled, seller, seller)).toBe(false);
    expect(orderAllowsReview(null, buyer, seller)).toBe(false);
  });
  it("writes a buyer-owned review tied to the order, after checking the order", async () => {
    const client = wallet(buyer);
    await new ArkivReviewRepository(undefined, orders(settled)).create({ seller, orderId: 7n, sellerRating: 5, itemRating: 4, text: " Great " }, client);
    const [schema, values, options] = client.createEntity.mock.calls[0];
    expect(schema).toBe(reviewSchema);
    expect(values.orderId).toMatchObject({ type: "u64", value: 7n });
    expect(options.expiration).toEqual(ExpirationTime.fromDays(REVIEW_DAYS));
    const blocked = new ArkivReviewRepository(undefined, orders({ ...settled, state: "Paid" }));
    await expect(blocked.create({ seller, orderId: 7n, sellerRating: 5, itemRating: 4, text: "" }, client)).rejects.toThrow("settled or refunded");
    await expect(blocked.create({ seller, orderId: 7n, sellerRating: 6, itemRating: 4, text: "" }, client)).rejects.toThrow("1 to 5");
  });
  it("keeps the newest review per order and counts only verified ones in summaries", async () => {
    const { client } = reader([reviewRow(buyer, "0x7", "0x2", "0x10"), reviewRow(buyer, "0x7", "0x5", "0x20"), reviewRow(seller, "0x8")]);
    const lookup: OrderLookup = { getOrder: vi.fn(async (id: bigint) => id === 7n ? settled : { buyer, seller, state: "Released" as const }) };
    const reviews = await new ArkivReviewRepository(client, lookup).listForSeller(seller);
    expect(reviews).toHaveLength(2);
    expect(reviews.find((review) => review.orderId === 7n)).toMatchObject({ sellerRating: 5, verified: true, text: "Smooth handover" });
    // The seller "reviewing" themselves is not the order's buyer.
    expect(reviews.find((review) => review.orderId === 8n)?.verified).toBe(false);
    expect(summarizeReviews(reviews)).toEqual({ count: 1, sellerAverage: 5, itemAverage: 4 });
    const unverified = await new ArkivReviewRepository(client).listForSeller(seller);
    expect(summarizeReviews(unverified)).toEqual({ count: 0, sellerAverage: null, itemAverage: null });
  });
});
