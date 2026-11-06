import type { Metadata } from "next";
import { ListingCheckout } from "@/components/checkout/ListingCheckout";

export const metadata: Metadata = {
  title: "Checkout | FreshMarket",
  description: "Pay for an Arkiv listing in USDT on Whitechain Sepolia with FreshPay.",
};

export default async function CheckoutPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"><ListingCheckout id={listingId} /></div>;
}
