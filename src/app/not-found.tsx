import Link from "next/link";
import { Search } from "lucide-react";

export default function NotFound() {
  return <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
    <span className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-secondary text-primary"><Search aria-hidden="true" className="h-7 w-7" /></span>
    <p className="editorial-kicker text-muted-foreground">404 · A little off the beaten path</p>
    <h1 className="mt-4 text-4xl font-semibold tracking-tight">This page isn’t here.</h1>
    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">The link may have changed. There are still plenty of things to discover in the marketplace.</p>
    <div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/browse" className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground">Browse listings</Link><Link href="/" className="rounded-xl border border-input px-6 py-3 text-sm font-semibold">Back to home</Link></div>
  </section>;
}
