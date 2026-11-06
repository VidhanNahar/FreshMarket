"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import type { Hex } from "viem";
import type { CreateListingInput, ListingWriteReceipt } from "@/domain/listing";
import { ARKIV_RABDI_CHAIN_ID } from "@/lib/arkiv/chain";
import { createListingWalletClient } from "@/lib/arkiv/wallet";
import { invalidateListings, listingKeys } from "@/lib/arkiv/queries";
import { estimateListingExpiration } from "@/lib/arkiv/expiration";
import { publishListing, verifyPublishedListing } from "@/services/publish-listing";

export type PublishPhase = "idle" | "preparing" | "signature" | "pending" | "verifying" | "verified" | "verification-delayed" | "error";

/**
 * Issue #6 owns form validation. Feed its CreateListingInput to submit().
 * State survives dialog closure. Once a transaction hash exists, submit is locked
 * until explicit reset; verification retries never ask the wallet to create again.
 */
export function usePublishListing() {
  const { data: wallet } = useWalletClient({ chainId: ARKIV_RABDI_CHAIN_ID });
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const sentHash = useRef<Hex | undefined>(undefined);
  const [phase, setPhase] = useState<PublishPhase>("idle");
  const [txHash, setTxHash] = useState<Hex>();
  const [receipt, setReceipt] = useState<ListingWriteReceipt>();
  const [creator, setCreator] = useState<Hex>();
  const [estimatedExpiresAt, setEstimatedExpiresAt] = useState<number | null>(null);

  const mutation = useMutation({
    retry: false, // Retrying a blockchain create could publish duplicates and spend extra gas.
    mutationFn: async (input: CreateListingInput) => {
      setPhase("preparing");
      if (!wallet) throw new Error("Connect your wallet on Arkiv Rabdi before publishing");
      const client = await createListingWalletClient(wallet, {
        onSignatureRequested: () => setPhase("signature"),
        onSubmitted: (hash) => {
          sentHash.current = hash;
          setTxHash(hash);
          setPhase("pending");
        },
      });
      const result = await publishListing(input, client, (confirmed) => {
        setReceipt(confirmed);
        setCreator(input.seller);
        sentHash.current = confirmed.txHash;
        setTxHash(confirmed.txHash);
        setPhase("verifying");
        // Invalidate immediately on confirmation, even if public read-back later times out.
        void invalidateListings(queryClient).catch(() => undefined);
      });
      if (result.listing) queryClient.setQueryData(listingKeys.detail(result.receipt.entityKey), result.listing);
      setEstimatedExpiresAt(await estimateListingExpiration(result.receipt.expiresAt));
      setPhase(result.listing ? "verified" : "verification-delayed");
      return result;
    },
    onError: () => setPhase("error"),
  });

  async function submit(input: CreateListingInput) {
    // Ref guards close the gap before React renders the disabled submit button.
    if (busy.current || sentHash.current) throw new Error("A submission already exists. Check its status before creating another listing.");
    busy.current = true;
    try { return await mutation.mutateAsync(input); }
    finally { busy.current = false; }
  }

  async function retryVerification() {
    if (!receipt || busy.current) return;
    busy.current = true;
    setPhase("verifying");
    try {
      const listing = await verifyPublishedListing(receipt.entityKey);
      if (listing) queryClient.setQueryData(listingKeys.detail(receipt.entityKey), listing);
      setEstimatedExpiresAt(await estimateListingExpiration(receipt.expiresAt));
      setPhase(listing ? "verified" : "verification-delayed");
      void invalidateListings(queryClient).catch(() => undefined);
    } finally { busy.current = false; }
  }

  function reset() {
    if (busy.current) return;
    // An unknown outcome after broadcast must be checked in the explorer before another write.
    sentHash.current = undefined;
    setTxHash(undefined);
    setReceipt(undefined);
    setCreator(undefined);
    setEstimatedExpiresAt(null);
    setPhase("idle");
    mutation.reset();
  }

  return { submit, retryVerification, reset, phase, txHash, receipt, creator, estimatedExpiresAt,
    error: mutation.error, isPending: mutation.isPending || phase === "verifying",
    canSubmit: Boolean(wallet) && !mutation.isPending && !txHash && phase !== "verifying" };
}

export type ListingPublishFlow = ReturnType<typeof usePublishListing>;
