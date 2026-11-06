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
  media: [`https://example.com/image?ref=${"a".repeat(200)}`],
  categoryPath: "furniture/tables", brand: "IKEA", model: "Linnmon 120", condition: "good", fulfilment: "pickup",
  city: " Navi  Mumbai ", price: 49.99,
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
      { name: "arkiv.schema", type: "str", value: "freshmarket.listings.v2" },
      { name: "seller", type: "addr", value: seller },
      { name: "status", type: "str", value: status },
      { name: "visibility", type: "str", value: "public" },
      { name: "categoryPath", type: "str", value: "furniture/tables" },
      { name: "brand", type: "str", value: "ikea" },
      { name: "model", type: "str", value: "linnmon120" },
      { name: "condition", type: "str", value: "good" },
      { name: "city", type: "str", value: "navi mumbai" },
      { name: "fulfilment", type: "str", value: "pickup" },
      { name: "priceMinor", type: "u64", value: "0x2fac970" },
      { name: "title", type: "str", value: input.title },
      { name: "description", type: "bytes", value: stringToHex(input.description) },
      { name: "media", type: "bytes", value: stringToHex(JSON.stringify(input.media)) },
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
  it("stores media references as a UTF-8 JSON list, including public Swarm references", async () => {
    const client = wallet();
    const reference = `bzz://${"ab".repeat(32)}`;
    await new ArkivListingRepository().create({ ...input, media: [reference, "https://example.com/b.jpg"] }, client);
    expect(JSON.parse(new TextDecoder().decode(client.createEntity.mock.calls[0][1].media))).toEqual([reference, "https://example.com/b.jpg"]);
  });

  it("returns an entity key and writes typed values with the default seven-day lifetime", async () => {
    const client = wallet();
    const repository = new ArkivListingRepository();
    expect(await repository.create(input, client)).toBe(entityKey);
    const [schema, values, options] = client.createEntity.mock.calls[0];
    expect(schema).toBe(listingSchema);
    expect(values.priceMinor).toMatchObject({ type: "u64", value: 49_990_000n });
    expect(values.seller.value).toBe(seller);
    expect(values.status).toBe("available");
    // Indexed search keys are normalized so equality and prefix queries match reliably.
    expect(values.city.value).toBe("navi mumbai");
    expect(values.brand.value).toBe("ikea");
    expect(values.model.value).toBe("linnmon120");
    expect(values.visibility.value).toBe("public");
    expect(values.categoryPath.value).toBe("furniture/tables");
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
    expect(hexToString(attributes["arkiv.schema"].value)).toBe("freshmarket.listings.v2");
    // The high bit of the attribute type ID is Arkiv's indexed flag (0x80).
    for (const name of ["seller", "status", "visibility", "categoryPath", "brand", "model", "condition", "city", "fulfilment", "priceMinor", "arkiv.schema"]) {
      expect(attributes[name].typeId & 128).toBe(128);
    }
    for (const name of ["title", "description", "media"]) {
      expect(attributes[name].typeId & 128).toBe(0);
    }
    expect(BigInt(attributes.priceMinor.value)).toBe(49_990_000n);
    expect(hexToString(attributes.description.value)).toBe(input.description.trim());
    expect(JSON.parse(hexToString(attributes.media.value))).toEqual(input.media);
    expect(payload.minLifetime).toBe(ExpirationTime.fromDays(7).minLifetime);
    expect(request.mock.calls.some(([call]) => call.method === "eth_sendTransaction")).toBe(false);
  });

  it.each<Partial<CreateListingInput>>([
    { seller: otherSeller }, { title: " " }, { title: "a".repeat(81) },
    { description: "a".repeat(1001) }, { media: ["http://example.com/a.png"] },
    { media: ["https://user:secret@example.com/a.png"] }, { media: [] },
    { media: Array(9).fill("https://example.com/a.png") }, { city: " " },
    { price: -1 }, { price: Infinity }, { price: Number.MAX_SAFE_INTEGER },
    { expirationDays: 0 }, { expirationDays: -1 }, { expirationDays: NaN },
    { categoryPath: "made/up" }, { categoryPath: "" },
    { condition: "broken" as CreateListingInput["condition"] }, { fulfilment: "teleport" as CreateListingInput["fulfilment"] },
    { visibility: "secret" as CreateListingInput["visibility"] }, { brand: "b".repeat(129) },
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
      id: entityKey, seller, owner: seller, status: "available", visibility: "public",
      categoryPath: "furniture/tables", brand: "ikea", model: "linnmon120", condition: "good",
      city: "navi mumbai", fulfilment: "pickup", priceMinor: 49_990_000n, title: input.title,
      description: input.description, media: input.media, createdAtBlock: 100n, expiresAtBlock: 302500n,
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

  it("combines schema, status, visibility, category, city and real owner filters with explicit pagination", async () => {
    const { repository, request } = reader({ data: [rpcEntity()], blockNumber: "0x64" });
    const listings = await repository.search({ categoryPaths: ["furniture"], city: "Navi Mumbai", seller, limit: 5, offset: 10 });
    expect(listings[0].title).toBe(input.title);
    const [{ method, params }] = request.mock.calls[0];
    expect(method).toBe("arkiv_query");
    expect(params[0]).toContain("arkiv.schema = str('freshmarket.listings.v2')");
    expect(params[0]).toContain("status = str('available')");
    expect(params[0]).toContain("visibility = str('public')");
    expect(params[0]).toContain("categoryPath");
    expect(params[0]).toContain("str('furniture')");
    expect(params[0]).toContain("city = str('navi mumbai')");
    expect(params[0]).toContain(`seller = addr(${seller})`);
    expect(params[0]).toContain(`$owner = addr(${seller})`);
    expect(params[0]).toContain("ORDER BY $key:key ASC");
    expect(params[1]).toMatchObject({ limit: "0x5", offset: "0xa", select: { key: true, owner: true } });
  });

  it("filters several category branches with OR, brand/model keys, condition and delivery", async () => {
    const { repository, request } = reader({ data: [], blockNumber: "0x64" });
    await repository.search({ categoryPaths: ["pets/dogs/toys", "pets/cats/toys"], brandOrModel: "ThinkPad T14", condition: "good", fulfilment: "ship" });
    const query = request.mock.calls[0][0].params[0];
    expect(query).toContain("pets/dogs/toys");
    expect(query).toContain("pets/cats/toys");
    expect(query).toContain("brand = str('thinkpadt14')");
    expect(query).toContain("thinkpadt14");
    expect(query).toContain("condition = str('good')");
    expect(query).toContain("fulfilment = str('ship')");
    await repository.search({ visibility: "all" });
    expect(request.mock.calls[1][0].params[0]).not.toContain("visibility");
  });

  it("excludes public records with values the app cannot render", async () => {
    const { repository, request } = reader(null);
    for (const [name, value] of [["condition", "broken"], ["fulfilment", "teleport"], ["visibility", "secret"], ["categoryPath", ""]]) {
      const entity = rpcEntity();
      const attribute = entity.attributes.find((attribute) => attribute.name === name)!;
      attribute.value = value;
      request.mockResolvedValue(entity);
      expect(await repository.getById(entityKey)).toBeNull();
    }
  });

  it("keeps only safe media references and tolerates malformed media JSON", async () => {
    const { repository, request } = reader(null);
    const entity = rpcEntity();
    entity.attributes.find((attribute) => attribute.name === "media")!.value =
      stringToHex(JSON.stringify(["javascript:alert(1)", "https://example.com/ok.jpg", 7]));
    request.mockResolvedValue(entity);
    expect((await repository.getById(entityKey))?.media).toEqual(["https://example.com/ok.jpg"]);
    entity.attributes.find((attribute) => attribute.name === "media")!.value = stringToHex("not json");
    expect((await repository.getById(entityKey))?.media).toEqual([]);
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
    expect(await repository.searchAll({ city: "Mumbai", categoryPaths: ["furniture"] })).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].params[1]).toMatchObject({ limit: "0x64", offset: "0x64" });
    expect(request.mock.calls[1][0].params[0]).toContain("city = str('mumbai')");
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
