import { describe, it, expect } from "vitest";
import { ARKIV_RABDI_CHAIN_ID } from "../lib/arkiv/chain";
import {
  ARKIV_ACCESS_KEYS_URL,
  ARKIV_FAUCET_URL,
  LOW_BALANCE_THRESHOLD_WEI,
  RABDI_CHAIN_ID,
  RABDI_CHAIN_NAME,
  describeChain,
  formatBalanceWei,
  getWalletErrorReason,
  isLowBalance,
  isRabdiChain,
  shortenAddress,
} from "../lib/wallet/wallet-ui";

describe("Phase 1: wallet UI helpers", () => {
  it("keeps the Rabdi chain ID in sync with the Arkiv client config", () => {
    expect(RABDI_CHAIN_ID).toBe(ARKIV_RABDI_CHAIN_ID);
    expect(RABDI_CHAIN_ID).toBe(7794095);
  });

  it("points users at the official Arkiv faucet", () => {
    expect(ARKIV_FAUCET_URL).toBe("https://hub.arkiv.network/faucet");
    expect(ARKIV_ACCESS_KEYS_URL).toBe("https://hub.arkiv.network/access-keys");
    expect(RABDI_CHAIN_NAME).toBe("Arkiv Rabdi Testnet");
  });

  describe("shortenAddress", () => {
    const address = "0x1234567890abcdef1234567890abcdef12345678";

    it("truncates a full address to 0x1234...5678", () => {
      expect(shortenAddress(address)).toBe("0x1234...5678");
    });

    it("supports custom leading and trailing lengths", () => {
      expect(shortenAddress(address, 8, 6)).toBe("0x123456...345678");
    });

    it("returns short or empty values unchanged", () => {
      expect(shortenAddress("0x1234")).toBe("0x1234");
      expect(shortenAddress("")).toBe("");
      expect(shortenAddress(undefined)).toBe("");
      expect(shortenAddress(null)).toBe("");
    });
  });

  describe("isRabdiChain", () => {
    it("accepts only chain 7794095", () => {
      expect(isRabdiChain(7794095)).toBe(true);
      expect(isRabdiChain(1)).toBe(false);
      expect(isRabdiChain(0)).toBe(false);
      expect(isRabdiChain(undefined)).toBe(false);
      expect(isRabdiChain(null)).toBe(false);
    });
  });

  describe("formatBalanceWei", () => {
    it("formats zero with a fixed precision", () => {
      expect(formatBalanceWei(0n)).toBe("0.0000");
    });

    it("formats exactly the low-balance threshold", () => {
      expect(formatBalanceWei(LOW_BALANCE_THRESHOLD_WEI)).toBe("0.0010");
    });

    it("truncates rather than rounds long fractions", () => {
      expect(formatBalanceWei(1_234_560_000_000_000_000n)).toBe("1.2345");
      expect(formatBalanceWei(1_234_560_000_000_000_000n, 18, 2)).toBe("1.23");
    });

    it("supports tokens with fewer decimals", () => {
      expect(formatBalanceWei(1_500_000n, 6)).toBe("1.5000");
    });
  });

  describe("isLowBalance", () => {
    it("uses 0.001 ETH as the warning threshold", () => {
      expect(LOW_BALANCE_THRESHOLD_WEI).toBe(1_000_000_000_000_000n);
    });

    it("warns below the threshold but not at or above it", () => {
      expect(isLowBalance(0n)).toBe(true);
      expect(isLowBalance(LOW_BALANCE_THRESHOLD_WEI - 1n)).toBe(true);
      expect(isLowBalance(LOW_BALANCE_THRESHOLD_WEI)).toBe(false);
      expect(isLowBalance(LOW_BALANCE_THRESHOLD_WEI + 1n)).toBe(false);
    });

    it("does not warn when the balance is unknown", () => {
      expect(isLowBalance(undefined)).toBe(false);
      expect(isLowBalance(null)).toBe(false);
    });
  });

  describe("describeChain", () => {
    it("names Arkiv Rabdi and common EVM networks", () => {
      expect(describeChain(7794095)).toBe("Arkiv Rabdi Testnet");
      expect(describeChain(1)).toBe("Ethereum Mainnet");
      expect(describeChain(8453)).toBe("Base");
    });

    it("falls back to a wallet-provided name, then the chain ID", () => {
      expect(describeChain(999999, "My Testnet")).toBe("My Testnet");
      expect(describeChain(999999, "Unknown Network")).toBe("Chain ID 999999");
      expect(describeChain(999999)).toBe("Chain ID 999999");
      expect(describeChain(undefined)).toBe("Unknown network");
    });
  });

  describe("getWalletErrorReason", () => {
    it("explains Arkiv's maximum lifetime when an extension goes too far", async () => {
      const { InvalidExpiryError } = await import("@arkiv-network/sdk");
      // The SDK's own wording when extendEntity's deadline is past the chain maximum.
      const error = new InvalidExpiryError("expiresAt resolves to block 9000000, past block 7884101: the chain's maximum lifetime is 7884000 blocks (about 182 days)");
      expect(getWalletErrorReason(error)).toBe("Arkiv keeps an entity for at most about 182 days from now. Choose a shorter extension.");
    });

    it("explains an unapproved custom-chain WalletConnect session", () => {
      const reason = getWalletErrorReason({ cause: { message: "Invalid chainId" } });
      expect(reason).toContain("Disconnect FreshMarket");
      expect(reason).toContain("reconnect");
    });

    it("explains a rejected wallet request", () => {
      expect(getWalletErrorReason({ code: 4001 })).toContain("rejected");
      expect(
        getWalletErrorReason(new Error("User rejected the request."))
      ).toContain("rejected");
      expect(
        getWalletErrorReason({ message: "User denied transaction signature" })
      ).toContain("rejected");
    });

    it("finds a rejection nested inside a viem/wagmi cause", () => {
      const nested = {
        message: "Switch chain failed",
        cause: { code: 4001, message: "User rejected the request." },
      };
      expect(getWalletErrorReason(nested)).toContain("rejected");
      expect(
        getWalletErrorReason({ shortMessage: "User rejected the request." })
      ).toContain("rejected");
      expect(getWalletErrorReason({ code: "ACTION_REJECTED" })).toContain(
        "rejected"
      );
    });

    it("explains a missing wallet extension", () => {
      expect(getWalletErrorReason(new Error("No provider found"))).toContain(
        "No browser wallet found"
      );
      expect(getWalletErrorReason({ message: "wallet not found" })).toContain(
        "MetaMask or Rabby"
      );
    });

    it("explains a pending wallet request", () => {
      expect(getWalletErrorReason(new Error("already pending"))).toContain(
        "already pending"
      );
    });

    it("explains an unknown Rabdi chain", () => {
      expect(
        getWalletErrorReason(new Error("Unrecognized chain ID"))
      ).toContain("Arkiv Rabdi is not added");
    });

    it("returns a safe generic message for unknown errors", () => {
      const generic = getWalletErrorReason(new Error("boom"));
      expect(generic).toContain("try again");
      expect(getWalletErrorReason(null)).toContain("try again");
    });
  });
});
