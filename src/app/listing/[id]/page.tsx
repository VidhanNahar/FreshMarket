import type { Metadata } from "next";
import { ListingDetail } from "@/components/listings/ListingDetail";

export const metadata: Metadata = {
  title: "Listing details | FreshMarket",
  description: "View item details, seller information and the public Arkiv record on FreshMarket.",
};

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"><ListingDetail id={id} /></div>;
}
