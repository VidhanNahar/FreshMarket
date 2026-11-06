import { StorefrontIdentityManager } from "@/components/identity/StorefrontIdentityManager";

export default function IdentityPage() {
  return <div className="container mx-auto max-w-3xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-bold">ENS storefront identity</h1>
    <p>Link your seller wallet to a Sepolia ENS name. Identity setup does not modify your Arkiv listing schema or listing ownership.</p>
    <StorefrontIdentityManager />
  </div>;
}
