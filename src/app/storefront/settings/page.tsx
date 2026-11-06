import { PageHeader } from "@/components/layout/PageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { StorefrontSettings } from "@/components/identity/StorefrontSettings";

export const metadata: Metadata = {
  title: "Storefront settings | FreshMarket",
  description: "Inspect your ENS storefront name, resolver records and delegated managers on Ethereum Sepolia.",
};

export default function StorefrontSettingsPage() {
  return <div className="container mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
    <PageHeader eyebrow="Your storefront" title="Storefront settings" description="Manage your seller name, profile and delegated managers on Ethereum Sepolia." backHref="/my-listings" backLabel="Back to my listings" />
    <p className="text-sm text-muted-foreground">New here? <Link href="/identity" className="font-semibold text-primary underline">Set up your ENS identity</Link> to give your wallet a recognizable name.</p>
    <StorefrontSettings />
  </div>;
}
