import { describe, expect, it, vi } from "vitest";
import { createPublicClient, createWalletClient, ExpirationTime, SchemaMismatchError } from "@arkiv-network/sdk";
import {
  custom, decodeAbiParameters, decodeFunctionData, hexToString,
  parseAbi, parseAbiParameters, stringToHex, type Hex,
} from "viem";
import { rabdiWalletChain } from "@/lib/arkiv/chain";
import { listingSchema } from "@/lib/arkiv/schema";
import { ArkivListingRepository, type ListingWalletClient } from "@/services/listing-repository";
import type { CreateListingInput } from "@/domain/listing";

const seller = "0x1111111111111111111111111111111111111111";
const otherSeller = "0x2222222222222222222222222222222222222222";
const entityKey = `0x${"ab".repeat(32)}` as Hex;
// Both long fields exceed str's 128-byte cap, guarding against accidentally using str().
const input: CreateListingInput = {
  seller, title: "Used desk", description: "Good condition. ".repeat(50),
  imageUrl: `https://example.com/image?ref=${"a".repeat(200)}`,
  category: "Furniture", city: "Mumbai", price: 49.99,
};

// Lightweight stub for repository validation tests; the serialization test uses the real SDK.
function wallet() {
  return {
    account: { address: seller, type: "json-rpc" },
    chain: rabdiWalletChain,
    createEntity: vi.fn().mockResolvedValue({ entityKey, txHash: entityKey, expiresAt: 302500n }),
  } satisfies ListingWalletClient;
}

// Wire-format fixtures go through the real SDK decoder and query builder.
function rpcEntity(status = "available", owner: Hex = seller) {
  return {
    key: entityKey, owner, creator: owner, createdAt: "0x64", updatedAt: "0x64",
    expiresAt: "0x49da4", creationFlags: 0,
    attributes: [
      { name: "arkiv.schema", type: "str", value: "freshmarket.listings" },
      { name: "seller", type: "addr", value: seller },
      { name: "title", type: "str", value: input.title },
      { name: "description", type: "bytes", value: stringToHex(input.description) },
      { name: "imageUrl", type: "bytes", value: stringToHex(input.imageUrl) },
      { name: "priceMinor", type: "u64", value: "0x1387" },
      { name: "currency", type: "str", value: "INR" },
      { name: "category", type: "str", value: "Furniture" },
      { name: "city", type: "str", value: "Mumbai" },
      { name: "status", type: "str", value: status },
      { name: "createdAt", type: "u64", value: "0x18bcfe56800" },
    ],
  };
}

// Mock only the RPC transport so SDK decoding, schema checks, and query rendering still run.
function reader(response: unknown) {
  const request = vi.fn().mockResolvedValue(response);
  const client = createPublicClient({
    chain: rabdiWalletChain, transport: custom({ request }, { retryCount: 0 }),
  });
  return { request, repository: new ArkivListingRepository(client) };
}

describe("Arkiv listing repository writes", () => {
  it("stores a public Swarm reference as UTF-8 imageUrl bytes", async () => {
    const client = wallet();
    const reference = `bzz://${"ab".repeat(32)}`;
    await new ArkivListingRepository().create({ ...input, imageUrl: reference }, client);
    expect(new TextDecoder().decode(client.createEntity.mock.calls[0][1].imageUrl)).toBe(reference);
  });

  it("returns an entity key and writes typed values with the default seven-day lifetime", async () => {
    const client = wallet();
    const repository = new ArkivListingRepository();
    expect(await repository.create(input, client)).toBe(entityKey);
    const [schema, values, options] = client.createEntity.mock.calls[0];
    expect(schema).toBe(listingSchema);
    expect(values.priceMinor).toMatchObject({ type: "u64", value: 4999n });
    expect(values.createdAt.type).toBe("u64");
    expect(values.seller.value).toBe(seller);
    expect(values.currency).toBe("INR");
    expect(values.status).toBe("available");
    expect(options.expiration).toEqual(ExpirationTime.fromDays(7));
    await repository.create({ ...input, expirationDays: 2 }, client);
    expect(client.createEntity.mock.calls[1][2].expiration).toEqual(ExpirationTime.fromDays(2));
  });

  it("serializes a real SDK create into ABI attributes, including long text, without sending a transaction", async () => {
    let calldata: Hex | undefined;
    const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_blockNumber") return "0x64";
      if (method === "eth_estimateGas") {
        // Gas estimation receives the fully encoded write. Stop here before wallet signing.
        calldata = (params?.[0] as { data: Hex }).data;
        throw new Error("stop-after-serialization");
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });
    const client = createWalletClient({
      account: seller, chain: rabdiWalletChain, transport: custom({ request }, { retryCount: 0 }),
    });
    await expect(new ArkivListingRepository().create(input, client)).rejects.toThrow();
    expect(calldata).toBeDefined();
    // Decode the public execute ABI independently to inspect what would reach the chain.
    const call = decodeFunctionData({
      abi: parseAbi(["function execute((uint8 operation, bytes operationData)[] ops) external returns (bytes32[] keys)"]),
      data: calldata!,
    });
    const [operation] = call.args[0];
    const [payload] = decodeAbiParameters(parseAbiParameters(
      "(uint128 salt, uint64 expiresAt, uint64 minLifetime, uint8 creationFlags, (bytes32 name, uint8 typeId, bytes value)[] attributes)",
    ), operation.operationData);
    const attributes = Object.fromEntries(payload.attributes.map((attribute) => [
      hexToString(attribute.name, { size: 32 }), attribute,
    ]));
    expect(hexToString(attributes["arkiv.schema"].value)).toBe("freshmarket.listings");
    // The high bit of the attribute type ID is Arkiv's indexed flag (0x80).
    for (const name of ["seller", "category", "status", "city", "priceMinor", "arkiv.schema"]) {
      expect(attributes[name].typeId & 128).toBe(128);
    }
    for (const name of ["title", "description", "imageUrl", "currency", "createdAt"]) {
      expect(attributes[name].typeId & 128).toBe(0);
    }
    expect(BigInt(attributes.priceMinor.value)).toBe(4999n);
    expect(hexToString(attributes.description.value)).toBe(input.description.trim());
    expect(hexToString(attributes.imageUrl.value)).toBe(input.imageUrl);
    expect(payload.minLifetime).toBe(ExpirationTime.fromDays(7).minLifetime);
    expect(request.mock.calls.some(([call]) => call.method === "eth_sendTransaction")).toBe(false);
  });

  it.each<Partial<CreateListingInput>>([
    { seller: otherSeller }, { title: " " }, { title: "a".repeat(81) },
    { description: "a".repeat(1001) }, { imageUrl: "http://example.com/a.png" },
    { imageUrl: "https://user:secret@example.com/a.png" }, { city: " " },
    { price: -1 }, { price: Infinity }, { price: Number.MAX_SAFE_INTEGER },
    { expirationDays: 0 }, { expirationDays: -1 }, { expirationDays: NaN },
    { currency: "JPY" }, { currency: "invalid" },
    // Arkiv's 128-byte str limit applies independently of the character count.
    { title: "अ".repeat(50) },
  ])("rejects invalid input before asking the wallet to write: %j", async (change) => {
    const client = wallet();
    await expect(new ArkivListingRepository().create({ ...input, ...change }, client)).rejects.toThrow();
    expect(client.createEntity).not.toHaveBeenCalled();
  });

  it("requires a connected Arkiv wallet on Rabdi", async () => {
    const client = wallet();
    const repository = new ArkivListingRepository();
    await expect(repository.create(input, { ...client, account: undefined })).rejects.toThrow("Connect a wallet");
    await expect(repository.create(input, { ...client, chain: { ...client.chain, id: 1 } })).rejects.toThrow("Connect a wallet");
  });
});

describe("Arkiv listing repository reads", () => {
  it("applies inclusive indexed price bounds, including zero", async () => {
    const { repository, request } = reader({ data: [], blockNumber: "0x64" });
    expect(await repository.search({ minPriceMinor: 0n, maxPriceMinor: 5000n })).toEqual([]);
    const query = request.mock.calls[0][0].params[0];
    expect(query).toContain("priceMinor >= u64(0)");
    expect(query).toContain("priceMinor <= u64(5000)");
  });

  it.each([{ minPriceMinor: -1n }, { maxPriceMinor: 2n ** 64n }, { minPriceMinor: 2n, maxPriceMinor: 1n }])(
    "rejects invalid price ranges before RPC: %#", async (filters) => {
      const { repository, request } = reader({ data: [], blockNumber: "0x64" });
      await expect(repository.search(filters)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("decodes SDK values into a domain listing and preserves expiration as a block height", async () => {
    const { repository } = reader(rpcEntity());
    expect(await repository.getById(entityKey)).toEqual({
      id: entityKey, seller, owner: seller, title: input.title, description: input.description,
      imageUrl: input.imageUrl, priceMinor: 4999n, currency: "INR", category: "Furniture",
      city: "Mumbai", status: "available", createdAt: 1700000000000,
      expiresAtBlock: 302500n,
    });
  });

  it("returns null for absent or expired entities and rejects invalid IDs without RPC calls", async () => {
    const { repository, request } = reader(null);
    expect(await repository.getById(entityKey)).toBeNull();
    request.mockClear();
    await expect(repository.getById("invalid")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("propagates RPC and schema failures instead of hiding them as missing listings", async () => {
    const { repository, request } = reader(null);
    request.mockRejectedValue(new Error("RPC unavailable"));
    await expect(repository.getById(entityKey)).rejects.toThrow("RPC unavailable");
    request.mockResolvedValue({ ...rpcEntity(), attributes: [] });
    await expect(repository.getById(entityKey)).rejects.toBeInstanceOf(SchemaMismatchError);
  });

  it("combines schema, status, category, city and real owner filters with explicit pagination", async () => {
    const { repository, request } = reader({ data: [rpcEntity()], blockNumber: "0x64" });
    const listings = await repository.search({ category: "Furniture", city: "Mumbai", seller, limit: 5, offset: 10 });
    expect(listings[0].title).toBe(input.title);
    const [{ method, params }] = request.mock.calls[0];
    expect(method).toBe("arkiv_query");
    expect(params[0]).toContain("arkiv.schema = str('freshmarket.listings')");
    expect(params[0]).toContain("status = str('available')");
    expect(params[0]).toContain("category = str('Furniture')");
    expect(params[0]).toContain("city = str('Mumbai')");
    expect(params[0]).toContain(`seller = addr(${seller})`);
    expect(params[0]).toContain(`$owner = addr(${seller})`);
    expect(params[0]).toContain("ORDER BY $key:key ASC");
    expect(params[1]).toMatchObject({ limit: "0x5", offset: "0xa", select: { key: true, owner: true } });
  });

  it("excludes public records that would crash date or currency rendering", async () => {
    const { repository, request } = reader(null);
    for (const [name, value] of [["createdAt", "0x1fffffffffffff"], ["currency", "invalid"], ["currency", "JPY"]]) {
      const entity = rpcEntity();
      const attribute = entity.attributes.find((attribute) => attribute.name === name)!;
      attribute.value = value;
      request.mockResolvedValue(entity);
      expect(await repository.getById(entityKey)).toBeNull();
    }
  });

  it("bounds scans of a hostile or excessively large public catalogue", async () => {
    const { repository, request } = reader({ data: Array(100).fill({ ...rpcEntity(), attributes: [] }), blockNumber: "0x64" });
    await expect(repository.searchAll()).rejects.toThrow("Catalogue read limit");
    expect(request).toHaveBeenCalledTimes(101);
  });

  it("does not stop when SDK schema validation skips every row on a full page", async () => {
    const { repository, request } = reader(null);
    const malformed = { ...rpcEntity(), attributes: [] };
    request.mockResolvedValueOnce({ data: Array(100).fill(malformed), blockNumber: "0x64" })
      .mockResolvedValueOnce({ data: [rpcEntity()], blockNumber: "0x64" });
    expect(await repository.searchAll()).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].params[1].offset).toBe("0x64");
  });

  it("loads subsequent discovery pages even when a full page contains rejected rows", async () => {
    const { repository, request } = reader(null);
    request.mockResolvedValueOnce({
      data: Array.from({ length: 100 }, () => rpcEntity("unknown")), blockNumber: "0x64",
    }).mockResolvedValueOnce({ data: [rpcEntity()], blockNumber: "0x64" });
    expect(await repository.searchAll({ city: "Mumbai", category: "Furniture" })).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].params[1]).toMatchObject({ limit: "0x64", offset: "0x64" });
    expect(request.mock.calls[1][0].params[0]).toContain("city = str('Mumbai')");
    expect(request.mock.calls[1][0].params[0]).toContain("status = str('available')");
  });

  it("supports all seller statuses, explicit sold status, and default page size", async () => {
    const { repository, request } = reader({ data: [rpcEntity("sold")], blockNumber: "0x64" });
    expect((await repository.search({ status: "all", seller }))[0].status).toBe("sold");
    expect(request.mock.calls[0][0].params[0]).not.toContain("status =");
    expect(request.mock.calls[0][0].params[1]).toMatchObject({ limit: "0x14", offset: "0x0" });
    await repository.search({ status: "sold" });
    expect(request.mock.calls[1][0].params[0]).toContain("status = str('sold')");
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { offset: -1 }, { offset: NaN }])(
    "rejects invalid pagination before RPC: %j", async (filters) => {
      const { repository, request } = reader({ data: [], blockNumber: "0x64" });
      await expect(repository.search(filters)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("excludes forged seller claims and unknown lifecycle statuses from reads", async () => {
    const forged = rpcEntity("available", otherSeller);
    const invalid = rpcEntity("unknown");
    const { repository, request } = reader(forged);
    expect(await repository.getById(entityKey)).toBeNull();
    request.mockResolvedValue(invalid);
    expect(await repository.getById(entityKey)).toBeNull();
    request.mockResolvedValue({ data: [forged, invalid, rpcEntity()], blockNumber: "0x64" });
    expect(await repository.search()).toHaveLength(1);
  });
});
