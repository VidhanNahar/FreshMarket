import { ExpirationTime, str, type CreateEntityValues, type FullRow, type PublicArkivClient, type WalletArkivClient } from "@arkiv-network/sdk";
import { asc, eq } from "@arkiv-network/sdk/query";
import { isAddressEqual, type Address } from "viem";
import { ARKIV_RABDI_CHAIN_ID, getArkivPublicClient } from "@/lib/arkiv/chain";
import { sellerSchema } from "@/lib/arkiv/schema";
import { ensResolvesTo, getEnsReader, sellerLabel, type EnsReader } from "@/lib/ens";

export const SELLER_TYPES = ["individual", "business"] as const;
export type SellerType = (typeof SELLER_TYPES)[number];
const isSellerType = (value: string): value is SellerType => SELLER_TYPES.some((type) => type === value);

/** About six months: Arkiv's maximum lifetime is ~182 days; publishing renews the profile. */
export const SELLER_PROFILE_DAYS = 180;

export interface SellerDirectoryEntry {
  id: string;
  owner: Address;
  ensName: string;
  sellerType: SellerType;
  updatedAtBlock: bigint;
}

export type SellerWalletClient = Pick<WalletArkivClient, "account" | "chain" | "createEntity">;
type SellerRow = FullRow<typeof sellerSchema>;

function mapRow(row: SellerRow): SellerDirectoryEntry | null {
  const sellerType = row.sellerType.value;
  if (!isSellerType(sellerType) || !sellerLabel(row.ensName.value)) return null;
  return { id: row.$key, owner: row.$owner, ensName: row.ensName.value, sellerType, updatedAtBlock: row.$updatedAt };
}

/** Readers keep only the newest record per wallet; older ones simply expire. */
function newestPerOwner(entries: SellerDirectoryEntry[]): SellerDirectoryEntry[] {
  const newest = new Map<string, SellerDirectoryEntry>();
  for (const entry of entries) {
    const current = newest.get(entry.owner.toLowerCase());
    if (!current || entry.updatedAtBlock > current.updatedAtBlock) newest.set(entry.owner.toLowerCase(), entry);
  }
  return [...newest.values()];
}

/** Arkiv seller directory keyed by ENS name (`freshmarket.sellers`). */
export class ArkivSellerRepository {
  constructor(private readonly publicClient?: PublicArkivClient, private readonly ens?: EnsReader) {}

  private async rows(build: (query: ReturnType<PublicArkivClient["select"]>) => void): Promise<SellerDirectoryEntry[]> {
    const client = this.publicClient ?? getArkivPublicClient();
    const query = client.select().from(sellerSchema);
    build(query);
    const result = await query.orderBy(asc("$key")).limit(100).fetch();
    return result.entities.map(mapRow).filter((entry) => entry !== null);
  }

  /**
   * Publishes the seller's directory entry. The ENS name must already resolve to the wallet,
   * so nobody can list themselves under another seller's name.
   */
  async publish(input: { ensName: string; sellerType: SellerType }, wallet: SellerWalletClient) {
    if (!wallet?.account || wallet.chain?.id !== ARKIV_RABDI_CHAIN_ID) {
      throw new Error("Connect a wallet on Arkiv Rabdi before publishing a seller profile");
    }
    const ensName = input.ensName.trim().toLowerCase();
    if (!sellerLabel(ensName)) throw new Error("Use your FreshMarket name, e.g. priya.freshmarket.eth");
    if (!isSellerType(input.sellerType)) throw new Error("Seller type must be individual or business");
    if (!await ensResolvesTo(ensName, wallet.account.address, this.ens ?? getEnsReader())) {
      throw new Error(`${ensName} does not resolve to the connected wallet`);
    }
    const values: CreateEntityValues<typeof sellerSchema> = { ensName: str(ensName), sellerType: str(input.sellerType) };
    return wallet.createEntity(sellerSchema, values, { expiration: ExpirationTime.fromDays(SELLER_PROFILE_DAYS) });
  }

  async getByOwner(owner: Address): Promise<SellerDirectoryEntry | null> {
    const entries = await this.rows((query) => { query.ownedBy(owner); });
    return newestPerOwner(entries.filter((entry) => isAddressEqual(entry.owner, owner)))[0] ?? null;
  }

  /** Looks up an ENS name and keeps only the record whose owner the name actually resolves to. */
  async findByEnsName(ensName: string): Promise<SellerDirectoryEntry | null> {
    const name = ensName.trim().toLowerCase();
    if (!sellerLabel(name)) return null;
    const candidates = newestPerOwner(await this.rows((query) => { query.where(eq("ensName", name)); }));
    for (const candidate of candidates) {
      if (await ensResolvesTo(name, candidate.owner, this.ens ?? getEnsReader())) return candidate;
    }
    return null;
  }
}

export const sellerRepository = new ArkivSellerRepository();
