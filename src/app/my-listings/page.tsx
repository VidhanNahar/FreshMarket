import type { Metadata } from "next";
import Link from "next/link";
import { SellerDashboard } from "@/components/seller/SellerDashboard";

export const metadata: Metadata = { title: "My listings | FreshMarket", description: "Manage your wallet-owned Arkiv listings." };
export default function MyListingsPage() {
  return <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-6"><div><h1 className="text-3xl font-extrabold">My listings</h1><p className="mt-2 text-sm">Manage availability, details and expiration. Sold items remain on Arkiv until you remove them or they expire.</p></div><Link href="/sell" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Create listing</Link></header><SellerDashboard /></div>;
}
