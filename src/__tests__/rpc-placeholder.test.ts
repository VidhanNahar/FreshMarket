import { describe, expect, it } from "vitest";
import { isPlaceholderUrl } from "@/lib/ens/config";

describe("RPC configuration", () => {
  it("treats copied template URLs as unset so the public endpoint is used", () => {
    for (const value of ["https://your-sepolia-rpc-endpoint", "https://your_rpc.example.com", "https://localhost-placeholder", "https://rpc"]) {
      expect(isPlaceholderUrl(value)).toBe(true);
    }
    for (const value of [undefined, "", "https://ethereum-sepolia-rpc.publicnode.com", "https://rpc.testnet.whitechain.io"]) {
      expect(isPlaceholderUrl(value)).toBe(false);
    }
  });
});
