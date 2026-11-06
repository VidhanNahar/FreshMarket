"use client";

import Link from "next/link";
import { useListing } from "@/hooks/use-listings";
import { formatPrice } from "@/domain/listing";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";
import { Button } from "@/components/ui/button";

/** Public read-back destination: this view never accesses wallet hooks or asks for a signature. */
export function ListingDetail({ id }: { id: string }) {
  const query = useListing(id);
  return <div className="container mx-auto max-w-3xl space-y-6 px-4 py-10">
    <Link className="underline" href="/browse">Back to browse</Link>
    {query.isPending && <p role="status">Loading listing from Arkiv…</p>}
    {query.isError && <div role="alert">
      <p>{getListingReadErrorMessage(query.error)}</p>
      <Button onClick={() => void query.refetch()}>Retry</Button>
    </div>}
    {query.isSuccess && (query.data ? <article className="space-y-4 rounded-xl border p-6">
      <h1 className="text-3xl font-bold">{query.data.title}</h1>
      <p className="text-2xl text-emerald-600">{formatPrice(query.data.priceMinor, query.data.currency)}</p>
      <p>{query.data.category} · {query.data.city} · {query.data.status}</p>
      <p className="whitespace-pre-wrap">{query.data.description}</p>
      <dl className="space-y-2 break-all text-sm">
        <dt>Seller / owner</dt><dd>{query.data.owner}</dd>
        <dt>Entity key</dt><dd>{query.data.id}</dd>
        <dt>Expiration block</dt><dd>{query.data.expiresAtBlock.toString()}</dd>
      </dl>
      <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh listing</Button>
    </article> : <div role="status">
      <h1 className="text-xl font-semibold">Listing unavailable</h1>
      <p>The listing may have expired, been removed, or not yet become publicly readable.</p>
      <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Check again</Button>
    </div>)}
  </div>;
}
