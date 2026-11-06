"use client";

import { useState } from "react";
import { isAddressEqual } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import type { FreshPayOrder } from "@/freshpay";
import { useSellerReviews, useWriteReview } from "@/hooks/use-reviews";
import { ARKIV_RABDI_CHAIN_ID } from "@/lib/arkiv/chain";
import { getWalletErrorReason } from "@/lib/wallet/wallet-ui";
import { MAX_REVIEW_TEXT } from "@/services/review-repository";
import { Stars } from "./SellerReviews";

const RATINGS = [5, 4, 3, 2, 1] as const;

function RatingField({ name, label, value, onChange }: { name: string; label: string; value: number; onChange: (value: number) => void }) {
  return <fieldset className="space-y-1">
    <legend className="text-sm font-medium">{label}</legend>
    <div className="flex flex-wrap gap-1.5">{RATINGS.map((rating) => <label key={rating} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${value === rating ? "border-emerald-600 bg-emerald-600/10 font-semibold" : "border-input"}`}>
      <input type="radio" name={name} value={rating} checked={value === rating} onChange={() => onChange(rating)} className="sr-only" />{rating} ★
    </label>)}</div>
  </fieldset>;
}

/**
 * Buyer review for a settled FreshPay order. The review is an Arkiv entity the buyer owns,
 * written on Rabdi; the order on Whitechain is its proof of purchase.
 */
export function ReviewForm({ order }: { order: FreshPayOrder }) {
  const { address, chainId } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const reviews = useSellerReviews(order.merchant);
  const write = useWriteReview();
  const [sellerRating, setSellerRating] = useState(5);
  const [itemRating, setItemRating] = useState(5);
  const [text, setText] = useState("");

  if (!address || !isAddressEqual(address, order.buyer)) return null;
  if (order.state !== "Released" && order.state !== "Refunded") {
    return <p className="text-sm text-muted-foreground">You can review the seller once you confirm the item arrived (or after a refund).</p>;
  }
  const existing = reviews.data?.find((review) => review.orderId === order.id && isAddressEqual(review.buyer, address));
  const onRabdi = chainId === ARKIV_RABDI_CHAIN_ID;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (await write.submit({ seller: order.merchant, orderId: order.id, sellerRating, itemRating, text })) {
      toast.success("Review published on Arkiv");
    }
  }

  return <section aria-labelledby="review-heading" className="space-y-4 rounded-2xl border editorial-rule bg-card p-5">
    <div>
      <h2 id="review-heading" className="font-semibold">{existing ? "Update your review" : "Review this seller"}</h2>
      <p className="text-sm text-muted-foreground">Published to Arkiv as a record you own for 180 days. It counts as verified because order #{order.id.toString()} names you as the buyer.</p>
    </div>
    {existing && <p className="text-sm">Current review: <Stars rating={existing.sellerRating} label="Seller rating" /> {existing.text && `“${existing.text}”`}</p>}
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <RatingField name="sellerRating" label="Seller" value={sellerRating} onChange={setSellerRating} />
      <RatingField name="itemRating" label="Item as described" value={itemRating} onChange={setItemRating} />
      <label className="block text-sm font-medium">Comments (optional)
        <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={MAX_REVIEW_TEXT} rows={3}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" placeholder="Was the item as described? How was pickup or shipping?" />
      </label>
      <p className="text-xs text-muted-foreground">Arkiv data is public. Don&rsquo;t include phone numbers or addresses.</p>
      {onRabdi
        ? <button type="submit" disabled={write.isPending} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {write.phase === "signature" ? "Confirm in your wallet…" : write.phase === "pending" ? "Publishing…" : existing ? "Publish updated review" : "Publish review"}
          </button>
        : <button type="button" disabled={switching} className="rounded-full border border-input px-5 py-2.5 text-sm font-semibold disabled:opacity-50" onClick={async () => {
            try { await switchChainAsync({ chainId: ARKIV_RABDI_CHAIN_ID }); }
            catch (error) { toast.error(getWalletErrorReason(error)); }
          }}>Switch to Arkiv Rabdi to sign the review</button>}
      {write.phase === "error" && write.error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{write.error}</p>}
      {write.txHash && <a className="block break-all text-sm text-emerald-700 underline dark:text-emerald-400" href={`https://rabdi.explorer.arkiv.network/tx/${write.txHash}`} target="_blank" rel="noopener noreferrer">Review transaction on Rabdi explorer ↗</a>}
      {write.phase === "published" && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Published. It appears on the seller&rsquo;s listings once Arkiv indexes it.</p>}
    </form>
  </section>;
}
