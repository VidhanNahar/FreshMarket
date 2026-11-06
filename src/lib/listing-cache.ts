import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Listing } from "@/domain/listing";
import { listingKeys } from "@/lib/arkiv/queries";

function matches(listing: Listing, key: QueryKey): boolean {
  if (key[2] === "owned") return listing.owner.toLowerCase() === String(key[3]).toLowerCase();
  const filters = key[3] as { status?: string; category?: string; city?: string; seller?: string; minPriceMinor?: string; maxPriceMinor?: string } | undefined;
  if (!filters || typeof filters !== "object") return true;
  const status = filters.status ?? "available";
  return (status === "all" || status === listing.status) &&
    (!filters.category || filters.category === "All Items" || filters.category === listing.category) &&
    (!filters.city || filters.city === listing.city) &&
    (!filters.seller || filters.seller.toLowerCase() === listing.seller.toLowerCase()) &&
    (filters.minPriceMinor === undefined || listing.priceMinor >= BigInt(filters.minPriceMinor)) &&
    (filters.maxPriceMinor === undefined || listing.priceMinor <= BigInt(filters.maxPriceMinor));
}

/** Change only this entity; rollback preserves unrelated records updated while a wallet prompt was open. */
export function changeListingCache(client: QueryClient, id: string, next: Listing | null) {
  const detailKey = listingKeys.detail(id);
  const priorDetail = client.getQueryData<Listing | null>(detailKey);
  const snapshots = client.getQueriesData<Listing[] | Listing | null>({ queryKey: listingKeys.all })
    .filter(([, value]) => Array.isArray(value) ? value.some((row) => row.id === id) : value?.id === id);
  for (const [key, value] of snapshots) {
    if (Array.isArray(value)) {
      client.setQueryData(key, value.flatMap((row) => row.id !== id ? [row] : next && matches(next, key) ? [next] : []));
    } else client.setQueryData(key, next);
  }
  // Detail state may not have been loaded yet.
  client.setQueryData(detailKey, next);
  return () => {
    for (const [key, value] of snapshots) {
      if (Array.isArray(value)) {
        const old = value.find((row) => row.id === id)!;
        client.setQueryData<Listing[]>(key, (current) => {
          const rows = (current ?? []).filter((row) => row.id !== id);
          rows.splice(Math.min(value.indexOf(old), rows.length), 0, old);
          return rows;
        });
      } else client.setQueryData(key, value);
    }
    if (priorDetail === undefined) client.removeQueries({ queryKey: detailKey, exact: true });
    else client.setQueryData(detailKey, priorDetail);
  };
}
