import type { Metadata } from "next";
import { MerchantPayments } from "@/components/checkout/MerchantPayments";

export const metadata: Metadata = { title: "Payments | FreshMarket", description: "FreshPay USDT sales, refunds and purchases on Whitechain." };
export default function MerchantPaymentsPage() {
  return <div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"><header className="border-b border-border pb-6"><h1 className="text-3xl font-extrabold">Payments</h1><p className="mt-2 text-sm">USDT orders settled by FreshPay on Whitechain Sepolia. Payments never change your Arkiv listings: you mark items reserved or sold yourself.</p></header><MerchantPayments /></div>;
}
