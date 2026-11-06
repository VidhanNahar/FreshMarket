"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { isAddressEqual } from "viem";
import { formatUsdt, secondsUntilRelease, whitechainAddressUrl, whitechainTxUrl, type FreshPayOrder, type OrderEvent } from "@/freshpay";
import { useListing } from "@/hooks/useListings";
import { useOrder, useOrderActions, useOrderEvents } from "@/hooks/use-freshpay-orders";
import { freshPayConfig } from "@/lib/freshpay/config";
import { shortenAddress } from "@/lib/wallet/wallet-ui";

const panel = "rounded-2xl border editorial-rule bg-card p-5";
const EVENT_LABELS: Record<OrderEvent["type"], string> = { paid: "Paid into escrow", released: "Released to seller", refunded: "Refunded to buyer" };

export function parseOrderId(value: string): bigint | null {
  return /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 2n ** 64n - 1n ? BigInt(value) : null;
}

export function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function OrderStateBadge({ order }: { order: FreshPayOrder }) {
  const label = order.state === "Paid" ? (order.refunded ? "Held · partly refunded" : "Held in escrow")
    : order.state === "Released" ? (order.refunded ? "Released · partly refunded" : "Released") : "Refunded";
  const tone = order.state === "Refunded" ? "bg-muted text-muted-foreground" : order.state === "Released" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

/** Customer receipt. Everything shown is read from FreshPay on Whitechain, never from the URL. */
export function OrderReceipt({ orderId }: { orderId: string }) {
  const id = parseOrderId(orderId);
  const { address } = useAccount();
  const order = useOrder(id);
  const events = useOrderEvents(id);
  const actions = useOrderActions();
  const listing = useListing(order.data?.ref ?? "");

  if (id === null) return <><h1 className="text-2xl font-bold">Invalid receipt link</h1><p className="mt-3">Order numbers are whole numbers starting at 1.</p></>;
  if (!freshPayConfig.contract) return <><h1 className="text-2xl font-bold">Receipts unavailable</h1><p className="mt-3">FreshPay is not configured on this deployment.</p></>;
  if (order.isPending) return <div role="status" aria-label="Loading receipt" className="h-64 animate-pulse rounded-2xl bg-muted" />;
  if (order.isError) return <div role="alert"><h1 className="text-2xl font-bold">Could not reach Whitechain</h1><p className="mt-3">The receipt is read live from the FreshPay contract. Retry in a moment.</p><button type="button" className="mt-4 rounded-lg bg-emerald-700 px-5 py-2 text-white" onClick={() => void order.refetch()}>Retry</button></div>;
  if (!order.data) return <><h1 className="text-2xl font-bold">Order #{orderId} not found</h1><p className="mt-3">FreshPay has no order with this number.</p></>;

  const o = order.data;
  const isBuyer = Boolean(address && isAddressEqual(address, o.buyer));
  const net = o.amount - o.refunded;
  const holdLeft = secondsUntilRelease(o);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b editorial-rule pb-6">
      <div><p className="editorial-kicker text-muted-foreground">FreshPay receipt</p><h1 className="text-3xl font-extrabold tracking-[-.04em]">Order #{o.id.toString()}</h1></div>
      <OrderStateBadge order={o} />
    </header>
    <section aria-label="Item" className={panel}>
      <p className="text-sm text-muted-foreground">Item</p>
      {listing.data ? <Link href={`/listing/${listing.data.id}`} className="text-lg font-semibold hover:underline">{listing.data.title}</Link>
        : <p className="text-lg font-semibold">{listing.isPending ? "Loading listing…" : "Listing no longer on Arkiv"}</p>}
      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Reference {o.ref}</p>
    </section>
    <dl className={`${panel} grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm`}>
      <dt className="text-muted-foreground">Paid</dt><dd className="font-semibold">{formatUsdt(o.amount)}</dd>
      <dt className="text-muted-foreground">Refunded</dt><dd>{formatUsdt(o.refunded)}</dd>
      <dt className="text-muted-foreground">Net to seller</dt><dd className="font-semibold">{formatUsdt(net)}</dd>
      <dt className="text-muted-foreground">Buyer</dt><dd><a className="underline" href={whitechainAddressUrl(o.buyer)} target="_blank" rel="noopener noreferrer">{shortenAddress(o.buyer)}</a>{isBuyer && " (you)"}</dd>
      <dt className="text-muted-foreground">Seller</dt><dd><a className="underline" href={whitechainAddressUrl(o.merchant)} target="_blank" rel="noopener noreferrer">{shortenAddress(o.merchant)}</a></dd>
      <dt className="text-muted-foreground">Paid at</dt><dd>{formatDate(o.paidAt)}</dd>
      {o.state === "Paid" && <><dt className="text-muted-foreground">Auto-release</dt><dd>{holdLeft ? `${formatDate(o.releaseAfter)} (seller can claim after this)` : "Due now: anyone can release to the seller"}</dd></>}
    </dl>
    {o.state === "Paid" && isBuyer && <section className={`${panel} space-y-3`}>
      <h2 className="font-semibold">Got the item?</h2>
      <p className="text-sm">Confirming releases {formatUsdt(net)} to the seller. Only confirm once you have the item; you cannot undo this, though the seller can still refund you.</p>
      <button type="button" disabled={actions.isPending} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void actions.run(o, { kind: "release" })}>
        {actions.pending ? "Confirm in your wallet…" : "Confirm item received"}
      </button>
    </section>}
    <section aria-label="Settlement history" className={`${panel} space-y-3`}>
      <h2 className="font-semibold">Whitechain transactions</h2>
      {events.isPending ? <p className="text-sm text-muted-foreground">Loading transactions…</p> : events.isError ? <p role="alert" className="text-sm">Could not load transaction history. The order state above is still read from the contract.</p> :
        <ol className="space-y-2 text-sm">{(events.data ?? []).map((event) => <li key={`${event.txHash}:${event.logIndex}`} className="flex flex-wrap justify-between gap-2">
          <span>{EVENT_LABELS[event.type]} · {formatUsdt(event.amount)}</span>
          <a className="break-all text-emerald-700 underline dark:text-emerald-400" href={whitechainTxUrl(event.txHash)} target="_blank" rel="noopener noreferrer">{shortenAddress(event.txHash, 10, 8)} ↗</a>
        </li>)}</ol>}
      <p className="text-xs text-muted-foreground">Order #{o.id.toString()} is public on Whitechain and is the proof of purchase a FreshMarket review cites.</p>
    </section>
  </div>;
}
