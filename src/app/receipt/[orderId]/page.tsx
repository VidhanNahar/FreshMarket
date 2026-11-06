import Link from "next/link";
import type { Metadata } from "next";
import { OrderReceipt } from "@/components/checkout/OrderReceipt";

export const metadata: Metadata = {
  title: "Receipt | FreshMarket",
  description: "A FreshPay order receipt read live from Whitechain Sepolia.",
};

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8"><Link href="/merchant/payments" className="mb-6 inline-block text-sm text-primary hover:underline">← Back to payments</Link><OrderReceipt orderId={orderId} /></div>;
}
