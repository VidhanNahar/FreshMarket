import { PageHeader } from "@/components/layout/PageHeader";
import Link from "next/link";
import { StorefrontIdentityManager } from "@/components/identity/StorefrontIdentityManager";

export default function IdentityPage() {
  return <div className="container mx-auto max-w-3xl space-y-6 px-4 py-10">
    <PageHeader eyebrow="Your seller identity" title="ENS storefront identity" description="Give your seller wallet a recognizable name. Set up a Sepolia ENS identity so buyers can recognize you across listings." backHref="/storefront/settings" backLabel="Back to storefront settings" />
    <p className="text-sm">Already have a storefront name? Manage records and delegates in <Link href="/storefront/settings" className="font-medium text-emerald-700 underline underline-offset-4 dark:text-emerald-400">storefront settings</Link>.</p>
    <StorefrontIdentityManager />
  </div>;
}
