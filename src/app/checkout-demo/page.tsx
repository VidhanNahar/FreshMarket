"use client";

// A merchant integration of the FreshPay widget. Only `@/freshpay` is imported: no FreshMarket code.
import { useState } from "react";
import { FreshPayCheckout, whitechainTxUrl, type VerifiedPayment } from "@/freshpay";

const FRESHPAY = process.env.NEXT_PUBLIC_FRESHPAY_ADDRESS as `0x${string}`;
const MERCHANT = process.env.NEXT_PUBLIC_FRESHPAY_DEMO_MERCHANT as `0x${string}`;

export default function CheckoutDemo() {
  const [orderId] = useState(() => `freshmarket-demo-${crypto.randomUUID()}`); // Your own order ID
  const [paid, setPaid] = useState<VerifiedPayment>();
  return (
    <div className="mx-auto my-12 grid max-w-lg gap-5 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <p className="editorial-kicker text-primary">Test payments</p><h1 className="text-3xl font-semibold tracking-tight">FreshPay payment demo</h1><p className="text-sm leading-relaxed text-muted-foreground">A standalone test of the payment widget for 4.5 USDT. This demo is separate from marketplace listings. Use an item’s Buy now action to pay for that specific item.</p>
      <FreshPayCheckout contract={FRESHPAY} merchant={MERCHANT} amount={4_500_000n} reference={orderId} onSuccess={setPaid} />
      {paid && <a href={whitechainTxUrl(paid.txHash)} style={{ textDecoration: "underline" }}>Order #{paid.order.id.toString()} receipt ↗</a>}
    </div>
  );
}
