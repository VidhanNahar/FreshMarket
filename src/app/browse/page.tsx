import type { Metadata } from "next";
import { Suspense } from "react";
import { Marketplace } from "@/components/listings/Marketplace";
import { ListingGridSkeleton } from "@/components/listings/ListingCard";

export const metadata: Metadata = {
  title: "Browse listings | FreshMarket",
  description: "Discover second-hand items on Arkiv. Search by title, category or city without connecting a wallet.",
};

export default function BrowsePage() {
  return <div className="container mx-auto max-w-[1600px] px-4 py-8 sm:px-8 lg:px-10 lg:py-12">
    <header className="grid gap-5 border-b editorial-rule pb-8 md:grid-cols-[1fr_.6fr] md:items-end"><div><p className="editorial-kicker text-emerald-700">The live catalogue</p><h1 className="mt-3 text-4xl font-extrabold tracking-[-.055em] sm:text-6xl">Browse active listings</h1></div><p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:justify-self-end">Discover useful things from local sellers. Search and compare without connecting a wallet.</p></header>
    <Suspense fallback={<div className="mt-8"><ListingGridSkeleton /></div>}><Marketplace /></Suspense>
  </div>;
}
