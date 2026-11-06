"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";
import { ARKIV_RABDI_CHAIN_ID } from "@/lib/arkiv/chain";
import { createListingWalletClient } from "@/lib/arkiv/wallet";
import { getWalletErrorReason } from "@/lib/wallet/wallet-ui";
import { reviewRepository, type CreateReviewInput } from "@/services/review-repository";

export const reviewKeys = {
  all: ["arkiv-reviews", ARKIV_RABDI_CHAIN_ID] as const,
  seller: (seller: Address) => [...reviewKeys.all, seller.toLowerCase()] as const,
};

/** Reviews of a seller, each checked against its FreshPay order on Whitechain. */
export function useSellerReviews(seller?: Address) {
  return useQuery({
    queryKey: reviewKeys.seller(seller ?? "0x0000000000000000000000000000000000000000"),
    queryFn: () => reviewRepository.listForSeller(seller!),
    enabled: Boolean(seller),
    staleTime: 30_000,
    retry: 1,
  });
}

type Phase = "idle" | "signature" | "pending" | "published" | "error";

/** Writes a buyer-owned review entity on Arkiv Rabdi. Never retries a wallet write. */
export function useWriteReview() {
  const { data: wallet } = useWalletClient({ chainId: ARKIV_RABDI_CHAIN_ID });
  const cache = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [txHash, setTxHash] = useState<Hex>();
  const [error, setError] = useState<string | null>(null);

  async function submit(input: CreateReviewInput): Promise<boolean> {
    if (phase === "signature" || phase === "pending") return false;
    setError(null);
    setTxHash(undefined);
    setPhase("signature");
    try {
      if (!wallet) throw new Error("Connect your wallet on Arkiv Rabdi to sign the review");
      const client = await createListingWalletClient(wallet, {
        onSignatureRequested: () => setPhase("signature"),
        onSubmitted: (hash) => { setTxHash(hash); setPhase("pending"); },
      });
      const receipt = await reviewRepository.create(input, client);
      setTxHash(receipt.txHash);
      setPhase("published");
      // The indexer can lag the receipt; refresh now and once more shortly after.
      await cache.invalidateQueries({ queryKey: reviewKeys.seller(input.seller) });
      setTimeout(() => void cache.invalidateQueries({ queryKey: reviewKeys.seller(input.seller) }), 4_000);
      return true;
    } catch (cause) {
      setError(getWalletErrorReason(cause));
      setPhase("error");
      return false;
    }
  }

  return { submit, phase, txHash, error, isPending: phase === "signature" || phase === "pending" };
}
