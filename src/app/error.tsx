"use client";
import Link from "next/link";
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="mx-auto my-12 max-w-xl space-y-5 rounded-2xl border border-border bg-card p-8 sm:p-10"><p className="editorial-kicker text-primary">Let’s try that again</p><h1 className="text-3xl font-semibold tracking-tight">This page couldn’t be displayed</h1><p className="text-sm leading-relaxed text-muted-foreground">Try loading it again. If you already submitted a transaction, check its status before sending another.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={reset} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">Try again</button><Link href="/browse" className="rounded-xl border border-input px-5 py-3 text-sm font-semibold">Back to marketplace</Link></div></section>;
}
