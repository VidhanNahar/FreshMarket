import type { Metadata } from "next";
import { ListingDetail } from "@/components/listings/ListingDetail";
import { formatPrice } from "@/domain/listing";
import { isEntityKey } from "@/lib/listing-discovery";
import { listingRepository } from "@/services/listing-repository";
import { resolveImageSource } from "../../../../shared/media";

const fallback: Metadata = {
  title: "Listing details | FreshMarket",
  description: "View item details, seller information and the public Arkiv record on FreshMarket.",
};

/** Link previews show the real item; a slow or failed Arkiv read falls back to generic text. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isEntityKey(id)) return fallback;
  try {
    const listing = await Promise.race([listingRepository.getById(id), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500))]);
    if (!listing) return fallback;
    const image = resolveImageSource(listing.media[0] ?? "");
    const title = `${listing.title} · ${formatPrice(listing.priceMinor)} | FreshMarket`;
    const description = listing.description.slice(0, 160);
    return { title, description, openGraph: { title, description, ...(image ? { images: [image] } : {}) } };
  } catch {
    return fallback;
  }
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"><ListingDetail id={id} /></div>;
}
