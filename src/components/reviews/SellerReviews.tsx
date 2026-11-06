"use client";

import Link from "next/link";
import type { Address } from "viem";
import { useSellerReviews } from "@/hooks/use-reviews";
import { freshPayConfig } from "@/lib/freshpay/config";
import { shortenAddress } from "@/lib/wallet/wallet-ui";
import { summarizeReviews, type Review } from "@/services/review-repository";

export function Stars({ rating, label }: { rating: number; label: string }) {
  return <span role="img" aria-label={`${label}: ${rating} out of 5`} className="tracking-tight text-amber-600 dark:text-amber-400">{"★".repeat(rating)}<span className="text-muted-foreground/40">{"★".repeat(5 - rating)}</span></span>;
}

/** Seller reputation from buyer-owned Arkiv reviews. Only reviews backed by a FreshPay order count. */
export function SellerReviews({ seller }: { seller: Address }) {
  const query = useSellerReviews(seller);
  if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading reviews…</p>;
  if (query.isError) return <p role="alert" className="text-sm text-muted-foreground">Reviews could not be loaded from Arkiv right now.</p>;

  const reviews = query.data ?? [];
  const summary = summarizeReviews(reviews);
  const verified = reviews.filter((review) => review.verified).sort((a, b) => Number(b.updatedAtBlock - a.updatedAtBlock));
  const unverified = reviews.length - verified.length;
  return <section aria-label="Seller reviews" className="space-y-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold">Buyer reviews</h3>
      {summary.count > 0 && summary.sellerAverage !== null && summary.itemAverage !== null &&
        <p className="text-sm">Seller {summary.sellerAverage.toFixed(1)}/5 · Items {summary.itemAverage.toFixed(1)}/5 · {summary.count} verified {summary.count === 1 ? "purchase" : "purchases"}</p>}
    </div>
    {verified.length === 0
      ? <p className="text-sm text-muted-foreground">No verified reviews yet. Buyers can review after a FreshPay order is released or refunded.</p>
      : <ul className="space-y-3">{verified.slice(0, 5).map((review) => <ReviewItem key={review.id} review={review} />)}</ul>}
    {unverified > 0 && <p className="text-xs text-muted-foreground">{unverified} {unverified === 1 ? "review is" : "reviews are"} hidden because {unverified === 1 ? "it isn't" : "they aren't"} backed by a settled FreshPay order{freshPayConfig.contract ? "" : " (FreshPay is not configured here)"}.</p>}
  </section>;
}

function ReviewItem({ review }: { review: Review }) {
  return <li className="space-y-1 rounded-xl border border-border p-3 text-sm">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Stars rating={review.sellerRating} label="Seller rating" />
      <span className="text-xs text-muted-foreground">Item <Stars rating={review.itemRating} label="Item rating" /></span>
    </div>
    {review.text && <p className="whitespace-pre-wrap break-words">{review.text}</p>}
    <p className="text-xs text-muted-foreground">Buyer {shortenAddress(review.buyer)} · <Link className="underline" href={`/receipt/${review.orderId}`}>verified purchase, order #{review.orderId.toString()}</Link></p>
  </li>;
}
