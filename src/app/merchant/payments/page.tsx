import { PageHeader } from "@/components/layout/PageHeader";
import type { Metadata } from "next";
import { MerchantPayments } from "@/components/checkout/MerchantPayments";

export const metadata: Metadata = { title: "Payments | FreshMarket", description: "FreshPay USDT sales, refunds and purchases on Whitechain." };
export default function MerchantPaymentsPage() {
  return <div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"><PageHeader eyebrow="Orders & purchases" title="Payments" description="Track your purchases, sales and refunds. Payments use USDT on Whitechain Sepolia; update listing availability separately in My listings." /><MerchantPayments /></div>;
}
