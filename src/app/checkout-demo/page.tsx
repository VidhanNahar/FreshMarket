"use client";

// A merchant integration of the FreshPay widget. Only `@/freshpay` is imported: no FreshMarket code.
import { useState } from "react";
import { FreshPayCheckout, whitechainTxUrl, type VerifiedPayment } from "@/freshpay";

const FRESHPAY = process.env.NEXT_PUBLIC_FRESHPAY_ADDRESS as `0x${string}`;
const MERCHANT = process.env.NEXT_PUBLIC_FRESHPAY_DEMO_MERCHANT as `0x${string}`;

export default function CheckoutDemo() {
  const [orderId] = useState(() => `chai-studio-${crypto.randomUUID()}`); // Your own order ID
  const [paid, setPaid] = useState<VerifiedPayment>();
  return (
    <div style={{ maxWidth: 440, margin: "48px auto", padding: 16, display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Chai Studio · 2 masala chai</h1>
      <FreshPayCheckout contract={FRESHPAY} merchant={MERCHANT} amount={4_500_000n} reference={orderId} onSuccess={setPaid} />
      {paid && <a href={whitechainTxUrl(paid.txHash)} style={{ textDecoration: "underline" }}>Order #{paid.order.id.toString()} receipt ↗</a>}
    </div>
  );
}
