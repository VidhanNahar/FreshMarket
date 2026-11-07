import { ImageResponse } from "next/og";

export const alt = "FreshMarket: list on Arkiv, pay in USDT on Whitechain, verified ENSv2 seller names";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview for shared links (ETHGlobal showcase, Discord, X). */
export default function OpengraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f6f5f0", color: "#191b18", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: 40, fontWeight: 800 }}>FreshMarket</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Publish once. Sell locally. Let stale listings expire.</div>
        <div style={{ fontSize: 32, color: "#4b5049" }}>Wallet-owned second-hand listings, paid in USDT, reviewed by real buyers.</div>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 26, fontWeight: 600 }}>
        {["Arkiv · listings & reviews", "Whitechain · USDT checkout", "ENSv2 · seller names"].map((label) => (
          <div key={label} style={{ padding: "10px 20px", borderRadius: 999, background: "#191b18", color: "#f6f5f0" }}>{label}</div>
        ))}
      </div>
    </div>,
    size,
  );
}
