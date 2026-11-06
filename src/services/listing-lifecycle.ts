import type { Listing, ListingStatus } from "@/domain/listing";
import { listingRepository, type ListingEdits, type ListingMutationClient, type ListingRepository } from "./listing-repository";

export type ListingAction =
  | { kind: "status"; status: ListingStatus }
  | { kind: "edit"; changes: ListingEdits }
  | { kind: "extend"; days: number }
  | { kind: "delete" };

export function previewListingAction(listing: Listing, action: ListingAction): Listing | null {
  if (action.kind === "delete") return null;
  if (action.kind === "status") return { ...listing, status: action.status };
  if (action.kind === "edit") return {
    ...listing,
    ...(action.changes.priceMinor !== undefined ? { priceMinor: action.changes.priceMinor } : {}),
    ...(action.changes.description !== undefined ? { description: action.changes.description.trim() } : {}),
  };
  return listing; // The SDK receipt supplies the authoritative extended deadline.
}

export function executeListingAction(id: string, action: ListingAction, wallet: ListingMutationClient,
  repository: ListingRepository = listingRepository) {
  switch (action.kind) {
    case "status": return repository.updateStatus(id, action.status, wallet);
    case "edit": return repository.updateListing(id, action.changes, wallet);
    case "extend": return repository.extendExpiry(id, action.days, wallet);
    case "delete": return repository.deleteListing(id, wallet);
  }
}

/** Indexing lag must never cause the wallet mutation to be retried. undefined means delayed. */
export async function verifyListingAction(id: string, action: ListingAction, expiresAt?: bigint,
  repository: Pick<ListingRepository, "getById"> = listingRepository,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Listing | null | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const listing = await repository.getById(id);
      if (action.kind === "delete" && listing === null) return null;
      if (listing && (
        (action.kind === "status" && listing.status === action.status) ||
        (action.kind === "edit" && (action.changes.priceMinor === undefined || listing.priceMinor === action.changes.priceMinor) &&
          (action.changes.description === undefined || listing.description === action.changes.description.trim())) ||
        (action.kind === "extend" && expiresAt !== undefined && listing.expiresAtBlock >= expiresAt)
      )) return listing;
    } catch { /* Retry public reads only; preserve the confirmed transaction. */ }
    if (attempt < 4) await wait(500 * 2 ** attempt);
  }
  return undefined;
}
