import { PageHeader } from "@/components/layout/PageHeader";
import type { Metadata } from "next";
import { SellerDashboard } from "@/components/seller/SellerDashboard";

export const metadata: Metadata = { title: "My listings | FreshMarket", description: "Manage your wallet-owned Arkiv listings." };
export default function MyListingsPage() {
  return <div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><PageHeader eyebrow="Your seller space" title="My listings" description="Give your pre-loved items a new home. Manage prices, availability and how long each listing stays live." /><SellerDashboard /></div>;
}
