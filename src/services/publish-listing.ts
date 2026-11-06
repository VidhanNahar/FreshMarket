import type { Hex } from "viem";
import type { CreateListingInput, Listing, ListingWriteReceipt } from "@/domain/listing";
import { listingRepository, type ListingWalletClient, type ListingRepository } from "./listing-repository";

export interface PublishedListing {
  receipt: ListingWriteReceipt;
  listing: Listing | null;
}

/**
 * Indexing may lag transaction confirmation. Retry only public reads; never retry the create.
 * Return null when verification is delayed so UI retains the confirmed receipt and offers
 * a read-only retry instead of inviting another paid transaction.
 */
export async function verifyPublishedListing(
  entityKey: Hex,
  repository: Pick<ListingRepository, "getById"> = listingRepository,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Listing | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const listing = await repository.getById(entityKey);
      if (listing) return listing;
    } catch {
      // A temporary public RPC failure must not hide an already confirmed write.
    }
    if (attempt < 4) await wait(Math.min(500 * 2 ** attempt, 4_000));
  }
  return null;
}

export async function publishListing(
  input: CreateListingInput,
  wallet: ListingWalletClient,
  onConfirmed: (receipt: ListingWriteReceipt) => void,
  repository: Pick<ListingRepository, "createWithReceipt" | "getById"> = listingRepository,
): Promise<PublishedListing> {
  const receipt = await repository.createWithReceipt(input, wallet);
  onConfirmed(receipt);
  return { receipt, listing: await verifyPublishedListing(receipt.entityKey, repository) };
}
