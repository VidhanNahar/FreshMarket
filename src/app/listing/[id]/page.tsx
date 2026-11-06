import { ListingDetail } from "@/components/listings/ListingDetail";

/** Keep route params on the server; the child owns public querying and retry controls. */
export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingDetail id={id} />;
}
