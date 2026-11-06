"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import { toast } from "sonner";
import type { Hex } from "viem";
import type { Listing } from "@/domain/listing";
import { ARKIV_RABDI_CHAIN_ID, getArkivPublicClient } from "@/lib/arkiv/chain";
import { createListingWalletClient } from "@/lib/arkiv/wallet";
import { invalidateListings, listingKeys } from "@/lib/arkiv/queries";
import { changeListingCache } from "@/lib/listing-cache";
import { getWalletErrorReason } from "@/lib/wallet/wallet-ui";
import { executeListingAction, previewListingAction, verifyListingAction, type ListingAction } from "@/services/listing-lifecycle";

type Phase = "idle" | "signature" | "pending" | "verifying" | "confirmed" | "delayed" | "unknown" | "error";
export function useListingActions() {
  const { data: wallet } = useWalletClient({ chainId: ARKIV_RABDI_CHAIN_ID });
  const cache = useQueryClient();
  const lock = useRef(false);
  const unresolved = useRef<{ hash: Hex; rollback: () => void } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [txHash, setTxHash] = useState<Hex>();

  async function run(listing: Listing, action: ListingAction): Promise<boolean> {
    if (lock.current || unresolved.current) return false;
    lock.current = true;
    setTxHash(undefined);
    setPhase("signature");
    let hash: Hex | undefined;
    let rollback = () => {};
    let confirmed = false;
    const notification = toast.loading("Preparing wallet request…");
    try {
      if (!wallet) throw new Error("Connect a wallet on Arkiv Rabdi");
      const client = await createListingWalletClient(wallet, {
        onSignatureRequested: () => { setPhase("signature"); toast.loading("Confirm the request in your wallet", { id: notification }); },
        onSubmitted: (value) => { hash = value; setTxHash(value); setPhase("pending"); toast.loading("Transaction pending…", { id: notification }); },
      });
      // No cache writes or signature requests for an obvious cross-wallet attempt.
      if (client.account?.address.toLowerCase() !== listing.owner.toLowerCase()) throw new Error("Unauthorized: only the listing owner can change this listing");
      await cache.cancelQueries({ queryKey: listingKeys.all });
      rollback = changeListingCache(cache, listing.id, previewListingAction(listing, action));
      const receipt = await executeListingAction(listing.id, action, client);
      confirmed = true;
      setTxHash(receipt.txHash);
      setPhase("verifying");
      toast.loading("Confirming on Arkiv indexer…", { id: notification });
      if (receipt.expiresAt !== undefined) changeListingCache(cache, listing.id, { ...listing, expiresAtBlock: receipt.expiresAt });
      // Mark every consumer stale immediately; wait for indexing before active refetches.
      await cache.invalidateQueries({ queryKey: listingKeys.all, refetchType: "none" });
      const fresh = await verifyListingAction(listing.id, action, receipt.expiresAt);
      if (fresh !== undefined) {
        changeListingCache(cache, listing.id, fresh);
        setPhase("confirmed");
        toast.success("Listing updated", { id: notification });
        await invalidateListings(cache).catch(() => undefined);
      } else {
        setPhase("delayed");
        toast.success("Transaction confirmed. Public indexing is delayed; refresh shortly.", { id: notification });
      }
      return true;
    } catch (error) {
      if (hash && !confirmed) {
        unresolved.current = { hash, rollback };
        setPhase("unknown");
        toast.error("Transaction submitted; confirmation is unknown. Check its status before retrying.", { id: notification });
      } else if (!confirmed) {
        rollback();
        setPhase("error");
        toast.error(getWalletErrorReason(error), { id: notification });
      } else {
        setPhase("delayed");
        toast.success("Transaction confirmed. Refresh to check the public record.", { id: notification });
      }
      return confirmed;
    } finally { lock.current = false; }
  }

  async function checkTransaction() {
    const pending = unresolved.current;
    if (!pending || lock.current) return;
    lock.current = true;
    try {
      const receipt = await getArkivPublicClient().getTransactionReceipt({ hash: pending.hash });
      if (receipt.status === "reverted") { pending.rollback(); setPhase("error"); toast.error("Transaction reverted. Your previous listing has been restored."); }
      else { setPhase("confirmed"); toast.success("Transaction confirmed. Refreshing listings."); }
      unresolved.current = null;
      await invalidateListings(cache).catch(() => undefined);
    } catch { toast.error("Confirmation is still unavailable. Check the explorer and try again shortly."); }
    finally { lock.current = false; }
  }

  return { run, checkTransaction, phase, txHash,
    isPending: ["signature", "pending", "verifying", "unknown"].includes(phase) };
}
