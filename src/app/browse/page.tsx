import type { Metadata } from "next";
import { Suspense } from "react";
import { Marketplace } from "@/components/listings/Marketplace";
import { ListingGridSkeleton } from "@/components/listings/ListingCard";

export const metadata: Metadata = {
  title: "Browse listings | FreshMarket",
  description: "Discover second-hand items on Arkiv. Search by title, category or city without connecting a wallet.",
};

export default function BrowsePage() {
  return <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <header className="border-b border-border pb-8"><p className="mb-2 text-sm font-semibold text-emerald-600">Find something worth keeping</p><h1 className="text-3xl font-extrabold tracking-tight">Browse active listings</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Discover second-hand finds from the live marketplace. Browse freely—no wallet connection required.</p></header>
    <Suspense fallback={<div className="mt-8"><ListingGridSkeleton /></div>}><Marketplace /></Suspense>
  </div>;
}
