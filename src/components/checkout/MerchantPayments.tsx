"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueries } from "@tanstack/react-query";
import { formatUsdt, secondsUntilRelease, whitechainAddressUrl, type FreshPayOrder } from "@/freshpay";
import { toPriceInput, type Listing } from "@/domain/listing";
import { useBuyerOrders, useMerchantOrders, useOrderActions } from "@/hooks/use-freshpay-orders";
import { listingQueryOptions } from "@/lib/arkiv/queries";
import { freshPayConfig } from "@/lib/freshpay/config";
import { parseListingPrice } from "@/lib/listing-price-input";
import { shortenAddress } from "@/lib/wallet/wallet-ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrderStateBadge, formatDate } from "./OrderReceipt";

const button = "rounded-lg border border-input px-3 py-2 text-sm font-medium hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

/** Reads the Arkiv listing behind each order; an expired or deleted listing reads as null. */
function useOrderListings(orders: readonly FreshPayOrder[]) {
  const results = useQueries({ queries: orders.map((order) => ({ ...listingQueryOptions(order.ref), staleTime: 30_000 })) });
  return new Map(orders.map((order, index) => [order.id, results[index]?.data as Listing | null | undefined]));
}

/** Payment settles on Whitechain; only the seller's own Arkiv transaction changes the listing. */
export function arkivPrompt(order: FreshPayOrder, listing: Listing | null | undefined): string | null {
  if (!listing || order.state === "Refunded") return null;
  if (listing.status === "available") return "Paid, but the listing still shows as available. Mark it reserved or sold in My Listings.";
  if (order.state === "Released" && listing.status === "reserved") return "Payment released. Mark the listing sold, extend it, or delete it when you are ready.";
  return null;
}

export function MerchantPayments() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const sales = useMerchantOrders(isConnected ? address : undefined);
  const purchases = useBuyerOrders(isConnected ? address : undefined);
  const salesListings = useOrderListings(sales.data ?? []);
  const purchaseListings = useOrderListings(purchases.data ?? []);
  const actions = useOrderActions();
  const [refunding, setRefunding] = useState<FreshPayOrder | null>(null);
  const [refundError, setRefundError] = useState("");

  if (!freshPayConfig.contract) return <p className="mt-8 rounded-2xl border border-dashed p-8 text-center">FreshPay is not configured on this deployment yet.</p>;
  if (!isConnected || !address) return <div className="mt-8 space-y-4 rounded-2xl border border-border p-8 text-center"><h2 className="text-xl font-semibold">Connect your wallet</h2><p>Sales and purchases are read from FreshPay for the connected wallet.</p><button type="button" className={button} onClick={openConnectModal}>Connect wallet</button></div>;

  const held = (sales.data ?? []).filter((order) => order.state === "Paid").reduce((sum, order) => sum + order.amount - order.refunded, 0n);
  const released = (sales.data ?? []).filter((order) => order.state === "Released").reduce((sum, order) => sum + order.amount - order.refunded, 0n);
  const remaining = refunding ? refunding.amount - refunding.refunded : 0n;

  async function submitRefund(form: FormData) {
    if (!refunding) return;
    let amount: bigint;
    try { amount = parseListingPrice(String(form.get("amount") ?? "")); }
    catch (error) { setRefundError(error instanceof Error ? error.message : "Enter an amount"); return; }
    if (amount <= 0n || amount > remaining) { setRefundError(`Enter an amount between 0.000001 and ${formatUsdt(remaining)}`); return; }
    setRefundError("");
    if (await actions.run(refunding, { kind: "refund", amount })) setRefunding(null);
  }

  return <div className="mt-8 space-y-10">
    <section aria-label="Totals" className="grid gap-4 sm:grid-cols-3">
      {[["Held in escrow", held], ["Released to you", released], ["Orders", BigInt(sales.data?.length ?? 0)]].map(([label, value]) =>
        <div key={String(label)} className="rounded-2xl border editorial-rule bg-card p-5"><p className="text-sm text-muted-foreground">{String(label)}</p><p className="mt-1 text-2xl font-bold">{label === "Orders" ? value.toString() : formatUsdt(value as bigint)}</p></div>)}
    </section>

    <section aria-labelledby="sales-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="sales-heading" className="text-xl font-semibold">Sales</h2><button type="button" className={button} disabled={sales.isFetching} onClick={() => void sales.refetch()}>Refresh</button></div>
      {sales.isPending ? <div role="status" className="h-32 animate-pulse rounded-2xl bg-muted" /> : sales.isError ? <p role="alert">Could not read FreshPay orders from Whitechain. Retry shortly.</p> : !sales.data?.length ? <p className="rounded-2xl border border-dashed p-8 text-center">No FreshPay sales for this wallet yet.</p> :
        <ul className="space-y-3">{sales.data.map((order) => {
          const listing = salesListings.get(order.id);
          const prompt = arkivPrompt(order, listing);
          const due = order.state === "Paid" && secondsUntilRelease(order) === 0;
          const busy = actions.pending?.startsWith(`${order.id}:`);
          return <li key={order.id.toString()} className="space-y-3 rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><Link href={`/receipt/${order.id}`} className="font-semibold hover:underline">Order #{order.id.toString()} · {listing?.title ?? (listing === null ? "Listing no longer on Arkiv" : "Loading listing…")}</Link>
                <p className="text-sm text-muted-foreground">{formatUsdt(order.amount)}{order.refunded ? ` · refunded ${formatUsdt(order.refunded)}` : ""} · buyer <a className="underline" href={whitechainAddressUrl(order.buyer)} target="_blank" rel="noopener noreferrer">{shortenAddress(order.buyer)}</a> · {formatDate(order.paidAt)}</p></div>
              <OrderStateBadge order={order} />
            </div>
            {listing && listing.priceMinor !== order.amount && order.state !== "Refunded" && <p role="alert" className="text-sm text-red-700 dark:text-red-400">Paid {formatUsdt(order.amount)} but the listing price is {formatUsdt(listing.priceMinor)}. Refund it if this is not what you agreed.</p>}
            {prompt && <p className="rounded-lg bg-amber-500/10 p-3 text-sm">{prompt} <Link href="/my-listings" className="font-semibold underline">Open My Listings</Link></p>}
            {order.state === "Paid" && !due && <p className="text-xs text-muted-foreground">Held until the buyer confirms receipt, or until {formatDate(order.releaseAfter)}.</p>}
            <div className="flex flex-wrap gap-2">
              {order.state === "Paid" && <button type="button" className={button} disabled={!due || actions.isPending} onClick={() => void actions.run(order, { kind: "release" })}>{busy && actions.pending?.endsWith("release") ? "Releasing…" : due ? "Claim payout" : "Payout after hold"}</button>}
              {order.state !== "Refunded" && <button type="button" className={`${button} text-red-700 dark:text-red-400`} disabled={actions.isPending} onClick={() => { setRefundError(""); setRefunding(order); }}>Issue refund</button>}
            </div>
          </li>;
        })}</ul>}
    </section>

    <section aria-labelledby="purchases-heading" className="space-y-4">
      <h2 id="purchases-heading" className="text-xl font-semibold">Your purchases</h2>
      {purchases.isPending ? <div role="status" className="h-24 animate-pulse rounded-2xl bg-muted" /> : purchases.isError ? <p role="alert">Could not read purchases from Whitechain.</p> : !purchases.data?.length ? <p className="text-sm text-muted-foreground">No purchases from this wallet yet.</p> :
        <ul className="space-y-2">{purchases.data.map((order) => <li key={order.id.toString()} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <Link href={`/receipt/${order.id}`} className="font-medium hover:underline">Order #{order.id.toString()} · {purchaseListings.get(order.id)?.title ?? "Listing"} · {formatUsdt(order.amount - order.refunded)}</Link>
          <OrderStateBadge order={order} />
        </li>)}</ul>}
    </section>

    <Dialog open={Boolean(refunding)} onOpenChange={(open) => { if (!open && !actions.isPending) setRefunding(null); }}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader><DialogTitle>Refund order #{refunding?.id.toString()}</DialogTitle>
          <DialogDescription>{refunding?.state === "Released" ? "These funds were already released to you, so the refund is paid from your wallet. You will approve the exact amount first." : "The refund is paid from escrow. A full refund frees the listing for another buyer."}</DialogDescription></DialogHeader>
        {refunding && <form key={refunding.id.toString()} className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submitRefund(new FormData(event.currentTarget)); }}>
          <label className="block text-sm font-medium">Amount (USDT, up to {formatUsdt(remaining)})
            <input name="amount" inputMode="decimal" required defaultValue={toPriceInput(remaining)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" aria-describedby="refund-error" />
          </label>
          {refundError && <p id="refund-error" role="alert" className="text-sm text-red-700">{refundError}</p>}
          <button type="submit" disabled={actions.isPending} className="w-full rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{actions.isPending ? "Confirm in your wallet…" : "Send refund"}</button>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}
