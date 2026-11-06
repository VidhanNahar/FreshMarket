"use client";

import type { CSSProperties } from "react";
import { isAddress } from "viem";
import { useConnect } from "wagmi";
import { WHITECHAIN_FAUCET_URL, whitechainTxUrl } from "./chain";
import { describeFreshPayError, formatUsdt, type VerifiedPayment } from "./sdk";
import { useFreshPayCheckout, type CheckoutPhase, type FreshPayCheckoutRequest } from "./use-freshpay-checkout";

export interface FreshPayCheckoutProps extends FreshPayCheckoutRequest {
  onSuccess?: (payment: VerifiedPayment) => void;
  onError?: (message: string) => void;
  /** Connect handler, e.g. RainbowKit's openConnectModal. Defaults to the first wagmi connector. */
  onConnect?: () => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

const STEPS: { phase: CheckoutPhase[]; label: string }[] = [
  { phase: ["switching"], label: "Whitechain Sepolia network" },
  { phase: ["checking", "approving"], label: "Approve USDT" },
  { phase: ["paying"], label: "Pay into FreshPay" },
  { phase: ["verifying"], label: "Verify order onchain" },
];
const ORDER: CheckoutPhase[] = ["idle", "switching", "checking", "approving", "paying", "verifying", "success"];

// Inline styles so the widget renders the same in any host app, with or without Tailwind.
const box: CSSProperties = { border: "1px solid #d4d4d8", borderRadius: 16, padding: 20, fontFamily: "inherit", display: "grid", gap: 14, background: "#fff", color: "#18181b" };
const primary: CSSProperties = { border: 0, borderRadius: 999, padding: "12px 18px", fontWeight: 600, fontSize: 15, background: "#047857", color: "#fff", cursor: "pointer" };
const link: CSSProperties = { color: "#047857", textDecoration: "underline", wordBreak: "break-all", fontSize: 13 };
const muted: CSSProperties = { color: "#52525b", fontSize: 13, margin: 0 };

/**
 * Drop-in USDT checkout for Whitechain. Needs a WagmiProvider whose config includes
 * Whitechain Sepolia (chain 1874) and a React Query provider, as every wagmi app has.
 */
export function FreshPayCheckout(props: FreshPayCheckoutProps) {
  if (!isAddress(props.contract ?? "") || !isAddress(props.merchant ?? "")) {
    return (
      <section role="alert" className={props.className} style={{ ...box, ...props.style }}>
        <span style={{ fontWeight: 600 }}>Checkout unavailable</span>
        <p style={muted}>The FreshPay contract or merchant address is not configured.</p>
      </section>
    );
  }
  return <Checkout {...props} />;
}

function Checkout({ onSuccess, onError, onConnect, disabled, className, style, ...request }: FreshPayCheckoutProps) {
  const checkout = useFreshPayCheckout(request);
  const { connect, connectors, isPending: connecting } = useConnect();
  const connectWallet = onConnect ?? (connectors[0] ? () => connect({ connector: connectors[0] }) : undefined);
  const current = ORDER.indexOf(checkout.phase);
  const short = checkout.balance !== undefined && checkout.balance < request.amount;

  async function start() {
    try {
      const payment = await checkout.run();
      if (payment) onSuccess?.(payment);
    } catch (error) {
      onError?.(describeFreshPayError(error));
    }
  }

  return (
    <section aria-label="Pay with USDT on Whitechain" className={className} style={{ ...box, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontWeight: 600 }}>Pay with USDT</span>
        <span style={{ fontSize: 24, fontWeight: 700 }}>{formatUsdt(request.amount)}</span>
      </div>
      {checkout.isConnected && checkout.balance !== undefined && (
        <p style={muted}>Wallet balance on Whitechain Sepolia: {formatUsdt(checkout.balance)}</p>
      )}
      {short && checkout.phase !== "success" && (
        <p role="alert" style={{ ...muted, color: "#b45309" }}>
          This wallet needs more test USDT. Gas is paid in WBT from the{" "}
          <a href={WHITECHAIN_FAUCET_URL} target="_blank" rel="noopener noreferrer" style={link}>Whitechain faucet</a>.
        </p>
      )}
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {STEPS.map((step) => {
          const index = Math.max(...step.phase.map((phase) => ORDER.indexOf(phase)));
          const done = checkout.phase === "success" || current > index;
          const active = step.phase.includes(checkout.phase);
          return (
            <li key={step.label} aria-current={active ? "step" : undefined} style={{ ...muted, color: done ? "#047857" : active ? "#18181b" : "#71717a", fontWeight: active ? 600 : 400 }}>
              {done ? "✓" : active ? "…" : "○"} {step.label}
            </li>
          );
        })}
      </ol>
      {checkout.approveHash && <a style={link} href={whitechainTxUrl(checkout.approveHash)} target="_blank" rel="noopener noreferrer">Approval transaction ↗</a>}
      {checkout.payHash && <a style={link} href={whitechainTxUrl(checkout.payHash)} target="_blank" rel="noopener noreferrer">Payment transaction ↗</a>}
      {checkout.phase === "error" && <p role="alert" style={{ ...muted, color: "#b91c1c" }}>{checkout.error}</p>}
      {checkout.phase === "success" && checkout.payment ? (
        <p role="status" style={{ ...muted, color: "#047857", fontWeight: 600 }}>
          Paid. Order #{checkout.payment.order.id.toString()} is confirmed on Whitechain.
        </p>
      ) : !checkout.isConnected ? (
        <button type="button" style={primary} onClick={connectWallet} disabled={!connectWallet || connecting}>Connect wallet to pay</button>
      ) : (
        <button type="button" style={{ ...primary, opacity: disabled || checkout.isBusy ? 0.6 : 1 }} disabled={disabled || checkout.isBusy} onClick={() => void start()}>
          {checkout.isBusy ? "Confirm in your wallet…" : checkout.phase === "error" ? "Try again" : checkout.onWhitechain ? `Pay ${formatUsdt(request.amount)}` : "Switch to Whitechain and pay"}
        </button>
      )}
    </section>
  );
}
