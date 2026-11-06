import type { Metadata } from "next";
import Link from "next/link";
import { StorefrontSettings } from "@/components/identity/StorefrontSettings";

export const metadata: Metadata = {
  title: "Storefront settings | FreshMarket",
  description: "Inspect your ENS storefront name, resolver records and delegated managers on Ethereum Sepolia.",
};

export default function StorefrontSettingsPage() {
  return <div className="container mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
    <header className="space-y-2 border-b border-border pb-6">
      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">ENSv2 · Ethereum Sepolia</p>
      <h1 className="text-3xl font-extrabold tracking-tight">Storefront settings</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        View your storefront name, resolver records and delegated managers. Need a storefront name first?{" "}
        <Link href="/identity" className="font-medium text-emerald-700 underline underline-offset-4 dark:text-emerald-400">Set up your ENS identity</Link>.
      </p>
    </header>
    <StorefrontSettings />
  </div>;
}
