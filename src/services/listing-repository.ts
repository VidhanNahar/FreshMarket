import {
  ExpirationTime,
  NoEntityFoundError,
  addr,
  str,
  u64,
  type CreateEntityValues,
  type FullRow,
  type PublicArkivClient,
  type WalletArkivClient,
} from "@arkiv-network/sdk";
import { MAX_CATALOGUE_MATCHES, CATALOGUE_READ_BUDGET_MS, CatalogueReadLimitError } from "../../shared/catalogue-limits";
import { resolveImageSource } from "../../shared/media";
import { asc, eq, gte, lte, or, startsWith } from "@arkiv-network/sdk/query";
import { hexToString, isAddressEqual, stringToBytes, type Hex } from "viem";
import { ARKIV_RABDI_CHAIN_ID, getArkivPublicClient } from "@/lib/arkiv/chain";
import { listingSchema } from "@/lib/arkiv/schema";
import {
  type Listing,
  type CreateListingInput,
  type ListingFilters,
  type ListingWriteReceipt,
  type ListingStatus,
  MAX_MEDIA_ITEMS,
  isListingCondition,
  isListingFulfilment,
  isListingStatus,
  isListingVisibility,
  toCityKey,
  toPriceMinor,
  toSearchKey,
} from "@/domain/listing";
import { isCategoryPath } from "../../shared/categories";

// Accept an Arkiv SDK client, not an unextended Wagmi/Viem wallet client.
export type ListingWalletClient = Pick<WalletArkivClient, "account" | "chain" | "createEntity">;
export type ListingMutationClient = Pick<WalletArkivClient, "account" | "chain" | "patchEntity" | "extendEntity" | "deleteEntity">;
export type ListingEdits = { priceMinor?: bigint; description?: string };
export type ListingMutationReceipt = { entityKey: Hex; txHash: Hex; expiresAt?: bigint };

/** Storage boundary for UI callers: SDK values and transaction receipts stay in this layer. */
export interface ListingRepository {
  create(input: CreateListingInput, walletClient: ListingWalletClient): Promise<string>;
  createWithReceipt(input: CreateListingInput, walletClient: ListingWalletClient): Promise<ListingWriteReceipt>;
  getById(id: string): Promise<Listing | null>;
  search(filters?: ListingFilters): Promise<Listing[]>;
  searchAll(filters?: Omit<ListingFilters, "limit" | "offset">): Promise<Listing[]>;
  searchOwned(seller: Hex): Promise<Listing[]>;
  updateListing(id: string, changes: ListingEdits, wallet: ListingMutationClient): Promise<ListingMutationReceipt>;
  updateStatus(id: string, status: ListingStatus, wallet: ListingMutationClient): Promise<ListingMutationReceipt>;
  extendExpiry(id: string, additionalDays: number, wallet: ListingMutationClient): Promise<ListingMutationReceipt>;
  deleteListing(id: string, wallet: ListingMutationClient): Promise<ListingMutationReceipt>;
}

type ListingRow = FullRow<typeof listingSchema>;

/** Decodes the media JSON list, keeping only references every reader can render safely. */
function decodeMedia(value: Hex): string[] {
  try {
    const parsed: unknown = JSON.parse(hexToString(value));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && resolveImageSource(item) !== null)
      .slice(0, MAX_MEDIA_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Unwraps a schema-checked SDK row into the application model.
 * The schema tag is public: other writers can claim it or forge a seller attribute,
 * so invalid enum values and seller/owner mismatches are excluded from reads.
 */
function mapEntityToListing(row: ListingRow): Listing | null {
  const status = row.status.value;
  const visibility = row.visibility.value;
  const condition = row.condition.value;
  const fulfilment = row.fulfilment.value;
  if (!isListingStatus(status) || !isListingVisibility(visibility) || !isListingCondition(condition) ||
      !isListingFulfilment(fulfilment) || !row.categoryPath.value || !isAddressEqual(row.seller.value, row.$owner)) {
    return null;
  }
  return {
    id: row.$key,
    seller: row.seller.value,
    owner: row.$owner,
    status,
    visibility,
    categoryPath: row.categoryPath.value,
    brand: row.brand.value,
    model: row.model.value,
    condition,
    city: row.city.value,
    fulfilment,
    priceMinor: row.priceMinor.value,
    title: row.title.value,
    description: hexToString(row.description.value),
    media: decodeMedia(row.media.value),
    createdAtBlock: row.$createdAt,
    expiresAtBlock: row.$expiresAt,
  };
}

// Application lengths use JS string code units. str() separately enforces UTF-8 byte limits.
function requiredText(value: string, field: string, maxLength?: number): string {
  const text = value.trim();
  if (!text || (maxLength !== undefined && text.length > maxLength)) {
    throw new Error(`${field} is required${maxLength ? ` and must be at most ${maxLength} characters` : ""}`);
  }
  return text;
}

/** Arkiv-backed storage for the version 1 listing contract documented in arkiv/schema.md. */
export class ArkivListingRepository implements ListingRepository {
  // Inject a client for isolated tests; normal callers lazily use the shared read client.
  constructor(private readonly publicClient?: PublicArkivClient) {}

  private async ownedListing(id: string, wallet: ListingMutationClient): Promise<Listing> {
    if (!wallet?.account || wallet.chain?.id !== ARKIV_RABDI_CHAIN_ID) {
      throw new Error("Connect a wallet on Arkiv Rabdi before managing listings");
    }
    const listing = await this.getById(id);
    if (!listing) throw new Error("Listing is missing, expired, or incompatible");
    if (!isAddressEqual(wallet.account.address, listing.seller) ||
        !isAddressEqual(wallet.account.address, listing.owner)) {
      throw new Error("Unauthorized: only the listing owner can change this listing");
    }
    return listing;
  }

  async updateListing(id: string, changes: ListingEdits, wallet: ListingMutationClient): Promise<ListingMutationReceipt> {
    if (changes.priceMinor === undefined && changes.description === undefined) throw new Error("No listing changes supplied");
    const set = {
      ...(changes.priceMinor !== undefined ? { priceMinor: u64(changes.priceMinor) } : {}),
      ...(changes.description !== undefined ? { description: stringToBytes(requiredText(changes.description, "Description", 1000)) } : {}),
    };
    await this.ownedListing(id, wallet);
    return wallet.patchEntity(listingSchema, id as Hex, { set });
  }

  async updateStatus(id: string, status: ListingStatus, wallet: ListingMutationClient): Promise<ListingMutationReceipt> {
    if (!isListingStatus(status)) throw new Error("Invalid listing status");
    await this.ownedListing(id, wallet);
    // Status changes never delete the record or change its expiry.
    return wallet.patchEntity(listingSchema, id as Hex, { set: { status } });
  }

  async extendExpiry(id: string, additionalDays: number, wallet: ListingMutationClient): Promise<ListingMutationReceipt> {
    if (![7, 14, 30].includes(additionalDays)) throw new Error("Choose 7, 14, or 30 additional days");
    const listing = await this.ownedListing(id, wallet);
    const extraBlocks = ExpirationTime.fromDays(additionalDays).minLifetime;
    return wallet.extendEntity({ entityKey: id as Hex,
      expiration: ExpirationTime.atBlock(listing.expiresAtBlock + extraBlocks) });
  }

  async deleteListing(id: string, wallet: ListingMutationClient): Promise<ListingMutationReceipt> {
    await this.ownedListing(id, wallet);
    return wallet.deleteEntity({ entityKey: id as Hex });
  }

  /**
   * Validates form values and asks the connected Arkiv wallet to create the entity.
   * Resolves to the entity key after SDK confirmation; validation and wallet errors propagate.
   */
  async create(input: CreateListingInput, walletClient: ListingWalletClient): Promise<string> {
    return (await this.createWithReceipt(input, walletClient)).entityKey;
  }

  /** Rich write result for publishing UI; create() retains issue #5's entity-key contract. */
  async createWithReceipt(input: CreateListingInput, walletClient: ListingWalletClient): Promise<ListingWriteReceipt> {
    if (!walletClient || typeof walletClient.createEntity !== "function") {
      throw new Error("An Arkiv wallet client is required to create listings");
    }
    if (!walletClient.account || walletClient.chain?.id !== ARKIV_RABDI_CHAIN_ID) {
      throw new Error("Connect a wallet on Arkiv Rabdi before creating a listing");
    }
    // The signing wallet becomes $owner; do not let a form claim another wallet as seller.
    const seller = addr(input.seller);
    if (!isAddressEqual(seller.value, walletClient.account.address)) {
      throw new Error("Listing seller must match the connected wallet");
    }

    // Use ?? so explicit zero is rejected rather than silently becoming the default lifetime.
    const expirationDays = input.expirationDays ?? 7;
    if (!Number.isFinite(expirationDays) || expirationDays <= 0) {
      throw new Error("Expiration days must be a positive finite number");
    }
    const expiration = ExpirationTime.fromDays(expirationDays);
    const title = requiredText(input.title, "Title", 80);
    const description = requiredText(input.description, "Description", 1000);
    const categoryPath = requiredText(input.categoryPath, "Category");
    if (!isCategoryPath(categoryPath)) throw new Error("Choose a category from the FreshMarket category list");
    const city = toCityKey(requiredText(input.city, "City"));
    const brand = toSearchKey(input.brand ?? "");
    const model = toSearchKey(input.model ?? "");
    if (!isListingCondition(input.condition)) throw new Error("Invalid item condition");
    if (!isListingFulfilment(input.fulfilment)) throw new Error("Choose local pickup or shipping");
    const visibility = input.visibility ?? "public";
    if (!isListingVisibility(visibility)) throw new Error("Invalid listing visibility");
    const media = (input.media ?? []).map((reference) => reference.trim()).filter(Boolean);
    if (!media.length || media.length > MAX_MEDIA_ITEMS) throw new Error(`Add between 1 and ${MAX_MEDIA_ITEMS} images`);
    for (const reference of media) {
      if (reference.length > 2048 || !resolveImageSource(reference)) {
        throw new Error("Images must be HTTPS URLs without credentials or public bzz:// references");
      }
    }

    // The SDK infers bare bigint as u256, so u64 columns need explicit u64() wrappers.
    // Long text uses UTF-8 bytes; mapEntityToListing reverses that encoding on reads.
    const values: CreateEntityValues<typeof listingSchema> = {
      seller,
      status: "available",
      visibility: str(visibility),
      categoryPath: str(categoryPath),
      brand: str(brand),
      model: str(model),
      condition: str(input.condition),
      city: str(city),
      fulfilment: str(input.fulfilment),
      priceMinor: u64(toPriceMinor(input.price)),
      title: str(title),
      description: stringToBytes(description),
      media: stringToBytes(JSON.stringify(media)),
    };
    return walletClient.createEntity(listingSchema, values, { expiration });
  }

  /** Missing, deleted and expired entities return null; RPC and schema errors propagate. */
  async getById(id: string): Promise<Listing | null> {
    try {
      const client = this.publicClient ?? getArkivPublicClient();
      // The Hex assertion only satisfies TS; the SDK still validates the key's 32-byte shape.
      return mapEntityToListing(await client.getEntity(id as Hex, listingSchema));
    } catch (error) {
      if (error instanceof NoEntityFoundError) return null;
      throw error;
    }
  }

  /**
   * Reads one active-entity page; Arkiv automatically excludes expired entities.
   * Use status: "all" for seller history, including reserved/sold items. SDK schema
   * mismatches and rejected domain rows can make the returned page smaller than limit.
   */
  async search(filters: ListingFilters = {}): Promise<Listing[]> {
    const { rows } = await this.searchRows(filters);
    return rows.map(mapEntityToListing).filter((listing) => listing !== null);
  }

  /** Fetch every page matching the indexed filters; text ranking happens on this narrowed set. */
  async searchAll(filters: Omit<ListingFilters, "limit" | "offset"> = {}): Promise<Listing[]> {
    return this.readAll(filters);
  }

  async searchOwned(seller: Hex): Promise<Listing[]> {
    return this.readAll({ seller, status: "all", visibility: "all" });
  }

  private async readAll(filters: ListingFilters): Promise<Listing[]> {
    const listings = new Map<string, Listing>();
    const started = performance.now();
    for (let offset = 0; ; offset += 100) {
      if (offset > MAX_CATALOGUE_MATCHES || performance.now() - started > CATALOGUE_READ_BUDGET_MS) throw new CatalogueReadLimitError();
      const { rows, covered } = await this.searchRows({ ...filters, limit: offset === MAX_CATALOGUE_MATCHES ? 1 : 100, offset });
      if (offset === MAX_CATALOGUE_MATCHES) {
        if (covered) throw new CatalogueReadLimitError();
        return [...listings.values()];
      }
      for (const row of rows) {
        const listing = mapEntityToListing(row);
        if (listing) listings.set(listing.id, listing);
      }
      // Skipped schema rows still consume node offsets and must not end pagination.
      if (covered < 100) return [...listings.values()];
    }
  }

  private async searchRows(filters: ListingFilters): Promise<{ rows: readonly ListingRow[]; covered: number }> {
    const client = this.publicClient ?? getArkivPublicClient();
    const query = client.select().from(listingSchema);
    const status = filters.status ?? "available";
    if (status !== "all") {
      if (!isListingStatus(status)) throw new Error("Invalid listing status");
      query.where(eq("status", status));
    }
    const visibility = filters.visibility ?? "public";
    if (visibility !== "all") {
      if (!isListingVisibility(visibility)) throw new Error("Invalid listing visibility");
      query.where(eq("visibility", visibility));
    }
    const categories = (filters.categoryPaths ?? []).map((path) => path.trim()).filter(Boolean);
    if (categories.length === 1) query.where(startsWith("categoryPath", categories[0]));
    else if (categories.length > 1) query.where(or(...categories.map((path) => startsWith("categoryPath", path))));
    const key = filters.brandOrModel ? toSearchKey(filters.brandOrModel) : "";
    if (key) query.where(or(eq("brand", key), startsWith("model", key)));
    if (filters.city) query.where(eq("city", toCityKey(filters.city)));
    if (filters.condition) {
      if (!isListingCondition(filters.condition)) throw new Error("Invalid item condition");
      query.where(eq("condition", filters.condition));
    }
    if (filters.fulfilment) {
      if (!isListingFulfilment(filters.fulfilment)) throw new Error("Invalid fulfilment option");
      query.where(eq("fulfilment", filters.fulfilment));
    }
    // Validate through u64() before querying, including explicit zero for free items.
    if (filters.minPriceMinor !== undefined && filters.maxPriceMinor !== undefined &&
        filters.minPriceMinor > filters.maxPriceMinor) {
      throw new Error("Minimum price cannot exceed maximum price");
    }
    if (filters.minPriceMinor !== undefined) query.where(gte("priceMinor", u64(filters.minPriceMinor)));
    if (filters.maxPriceMinor !== undefined) query.where(lte("priceMinor", u64(filters.maxPriceMinor)));
    if (filters.seller) {
      // A seller attribute alone is forgeable; also require actual entity ownership.
      query.where(eq("seller", addr(filters.seller))).ownedBy(filters.seller);
    }

    // A unique key gives stable ordering while data is unchanged. Concurrent writes/expiry
    // can still shift offset pages. The SDK validates limit (1–100) and offset on fetch().
    const result = await query
      .orderBy(asc("$key"))
      .limit(filters.limit ?? 20)
      .offset(filters.offset ?? 0)
      .fetch();
    return { rows: result.entities, covered: result.entities.length + result.skipped };
  }
}

export const listingRepository = new ArkivListingRepository();
