"use client";

import { PageSkeleton } from "@/components/listings/PageSkeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { FreshPayCheckout, whitechainAddressUrl, type VerifiedPayment } from "@/freshpay";
import { CONDITION_LABELS, FULFILMENT_LABELS, displayCity, formatPrice } from "@/domain/listing";
import { useListing, useRabdiBlock } from "@/hooks/useListings";
import { useActiveOrder } from "@/hooks/use-freshpay-orders";
import { isEntityKey } from "@/lib/listing-discovery";
import { getListingReadErrorMessage } from "@/lib/arkiv/queries";
import { freshPayConfig, freshPayConfigurationError } from "@/lib/freshpay/config";
import { CHECKOUT_BLOCK_MESSAGES, checkoutBlock, orderKeys } from "@/lib/freshpay/orders";
import { SellerIdentity } from "@/components/identity/SellerIdentity";
import { ListingImage } from "@/components/listings/ListingImage";

const panel = "rounded-2xl border editorial-rule bg-card p-5";

/** Buys one Arkiv listing: Arkiv supplies price, seller and status; FreshPay settles in USDT. */
export function ListingCheckout({ id }: { id: string }) {
  const router = useRouter();
  const cache = useQueryClient();
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const query = useListing(id);
  const block = useRabdiBlock();
  const listing = query.data;
  const active = useActiveOrder(listing?.seller, listing?.id);
  const back = <Link href={isEntityKey(id) ? `/listing/${id}` : "/browse"} className="mb-6 inline-block text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Back to listing</Link>;

  if (!isEntityKey(id)) return <>{back}<h1 className="text-2xl font-bold">Invalid checkout link</h1><p className="mt-3">This link does not contain a valid Arkiv listing key.</p></>;
  if (query.isPending) return <>{back}<PageSkeleton label="Loading listing" detail /></>;
  if (query.isError) return <>{back}<div role="alert"><h1 className="text-2xl font-bold">We couldn’t load this listing</h1><p className="mt-3">{getListingReadErrorMessage(query.error)}</p><button type="button" className="mt-4 rounded-lg bg-emerald-700 px-5 py-2 text-white" onClick={() => void query.refetch()}>Try again</button></div></>;

  const blocked = freshPayConfigurationError ? "not-deployed" : checkoutBlock({
    contract: freshPayConfig.contract, listing, currentBlock: block.data, activeOrder: active.data, viewer: address,
  });
  // The "already paid" lock lives on Whitechain; wait for it before offering the widget.
  const checkingLock = !blocked && active.isPending && Boolean(freshPayConfig.contract);

  async function paid(payment: VerifiedPayment) {
    await cache.invalidateQueries({ queryKey: orderKeys.all });
    router.push(`/receipt/${payment.order.id}`);
  }

  return <>{back}<div className="grid gap-8 lg:grid-cols-[1fr_420px]">
    <section aria-label="Order summary" className="space-y-5">
      <p className="editorial-kicker text-muted-foreground">Checkout</p>
      <h1 className="break-words text-3xl font-extrabold tracking-[-.04em]">{listing?.title ?? "Listing unavailable"}</h1>
      {listing && <>
        <div className="overflow-hidden rounded-2xl bg-card"><ListingImage src={listing.media[0] ?? ""} title={listing.title} /></div>
        <dl className={`${panel} grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm`}>
          <dt className="text-muted-foreground">Price</dt><dd className="font-semibold">{formatPrice(listing.priceMinor)} <span className="font-normal text-muted-foreground">(Arkiv priceMinor {listing.priceMinor.toString()})</span></dd>
          <dt className="text-muted-foreground">Condition</dt><dd>{CONDITION_LABELS[listing.condition]}</dd>
          <dt className="text-muted-foreground">Delivery</dt><dd>{FULFILMENT_LABELS[listing.fulfilment]} · {displayCity(listing.city)}</dd>
          <dt className="text-muted-foreground">Seller</dt><dd className="min-w-0"><SellerIdentity address={listing.seller} /></dd>
          <dt className="text-muted-foreground">Listing</dt><dd className="break-all font-mono text-xs">{listing.id}</dd>
        </dl>
      </>}
    </section>
    <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
      {blocked ? <div role="alert" className={`${panel} space-y-3`}>
        <h2 className="font-semibold">Checkout unavailable</h2>
        <p className="text-sm">{CHECKOUT_BLOCK_MESSAGES[blocked]}</p>
        {blocked === "already-paid" && active.data && <Link className="text-sm text-emerald-700 underline" href={`/receipt/${active.data.id}`}>View order #{active.data.id.toString()}</Link>}
      </div> : checkingLock ? <div role="status" className={`${panel} text-sm`}>Checking whether this item is already paid…</div> : active.isError ? <div role="alert" className={`${panel} space-y-3`}><h2 className="font-semibold">Couldn’t verify purchase availability</h2><p className="text-sm text-muted-foreground">Check again before paying so we can confirm whether this item already has an order.</p><button type="button" onClick={() => void active.refetch()} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Retry availability check</button></div> : listing && freshPayConfig.contract && <>
        <FreshPayCheckout contract={freshPayConfig.contract} merchant={listing.seller} amount={listing.priceMinor} reference={listing.id}
          onConnect={openConnectModal} onSuccess={(payment) => void paid(payment)} />
        <div className={`${panel} space-y-2 text-xs text-muted-foreground`}>
          <p><strong className="text-foreground">Held until you confirm.</strong> Your USDT sits in the FreshPay contract until you confirm the item arrived, or until the hold period ends. The seller can refund you from escrow at any time.</p>
          <p>The amount and seller come from the Arkiv listing, not from this page. One payment per listing: a second buyer cannot pay for the same item.</p>
          <a className="underline" href={whitechainAddressUrl(freshPayConfig.contract)} target="_blank" rel="noopener noreferrer">FreshPay contract on Whitechain explorer ↗</a>
        </div>
      </>}
    </aside>
  </div></>;
}
