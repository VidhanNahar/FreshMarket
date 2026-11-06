import Link from "next/link";
import { ArrowRight, Clock, ShieldCheck, Share2, Search, MapPin, PackageCheck, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      <section className="w-full overflow-hidden border-b editorial-rule">
        <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1600px] lg:grid-cols-[1.12fr_.88fr]">
          <div className="flex flex-col justify-between px-5 py-10 sm:px-8 lg:px-14 lg:py-16 xl:px-20">
            <div className="flex items-center justify-between gap-4">
              <p className="editorial-kicker text-emerald-800 dark:text-emerald-300">Second-hand, first choice</p>
              <Badge variant="outline" className="rounded-full border-foreground/20 bg-card/60 text-[11px]">Live on Arkiv Rabdi</Badge>
            </div>
            <div className="my-16 max-w-5xl lg:my-10">
              <h1 className="display-title">Find good things.<br/><span className="text-emerald-700 dark:text-emerald-400">Keep them moving.</span></h1>
              <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">A local marketplace for useful things with real owners, clear expiry and public records. Browse without an account. Connect a wallet only when you want to sell.</p>
              <form action="/browse" className="mt-10 flex max-w-2xl flex-col gap-2 rounded-2xl border border-foreground/15 bg-card p-2 shadow-[0_18px_60px_rgba(25,27,24,.08)] sm:flex-row">
                <label className="flex flex-1 items-center gap-3 px-3"><Search className="h-5 w-5 text-muted-foreground"/><span className="sr-only">Search marketplace</span><input name="q" type="search" placeholder="Search dog toys, phones, furniture…" className="min-h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"/></label>
                <button className="min-h-12 rounded-xl bg-emerald-700 px-6 text-sm font-bold text-white transition hover:bg-emerald-800">Search marketplace</button>
              </form>
            </div>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t editorial-rule pt-5 text-xs text-muted-foreground"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700"/>Wallet-owned</span><span className="flex items-center gap-2"><Clock className="h-4 w-4 text-emerald-700"/>Listings expire</span><span className="flex items-center gap-2"><Share2 className="h-4 w-4 text-emerald-700"/>Portable storefronts</span></div>
          </div>
          <div className="relative min-h-[520px] overflow-hidden bg-[#163e31] p-5 text-white sm:p-8 lg:min-h-full lg:p-12">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/20"/><div className="absolute -right-8 -top-8 h-44 w-44 rounded-full border border-white/20"/>
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between"><p className="editorial-kicker text-white/70">Fresh this week</p><Sparkles className="h-5 w-5 text-lime-200"/></div>
              <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-3 py-10 sm:gap-5">
                <div className="translate-y-8 rounded-[2rem] bg-[#d9f99d] p-5 text-[#163e31] shadow-2xl sm:p-7"><PackageCheck className="h-8 w-8"/><p className="mt-20 text-4xl font-black tracking-tight">Useful.</p><p className="mt-2 text-sm">Objects with another chapter left.</p></div>
                <div className="rounded-[2rem] bg-[#fff9e8] p-5 text-[#191b18] shadow-2xl sm:p-7"><MapPin className="h-8 w-8 text-emerald-700"/><p className="mt-20 text-4xl font-black tracking-tight">Nearby.</p><p className="mt-2 text-sm text-[#62665f]">Discover items in your city.</p></div>
                <div className="col-span-2 ml-auto mt-2 flex w-[82%] items-center justify-between rounded-full border border-white/20 bg-white/10 px-5 py-4 backdrop-blur"><span className="text-sm font-semibold">Browse today’s listings</span><Link href="/browse" aria-label="Browse marketplace" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#163e31]"><ArrowRight className="h-5 w-5"/></Link></div>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-white/65">Every listing stays controlled by its seller and can be read by independent storefronts.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Pillars / Problem & Solution */}
      <section className="w-full py-20 md:py-28">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 grid gap-5 border-b editorial-rule pb-8 md:grid-cols-[1fr_.65fr] md:items-end">
            <div><p className="editorial-kicker text-emerald-700">Made for real exchanges</p><h2 className="mt-4 text-4xl font-bold tracking-[-.045em] sm:text-6xl">Trust the listing,<br/>then meet the thing.</h2></div>
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground md:justify-self-end">FreshMarket keeps product discovery familiar while Arkiv handles ownership, lifecycle and portability underneath.</p>
          </div>

          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border editorial-rule bg-border md:grid-cols-3">
            {/* Pillar 1 */}
            <Card className="rounded-none border-0 shadow-none">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                  <Clock className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">Automatic Expiration</CardTitle>
                <CardDescription>
                  Listings have a deterministic lifetime (e.g. 7 days). Stale listings naturally drop out of active discovery unless renewed by the seller.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> No ghost inventory
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> One-click renewal by seller
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Pillar 2 */}
            <Card className="rounded-none border-0 shadow-none">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">Wallet-Owned Entities</CardTitle>
                <CardDescription>
                  Every listing is an Arkiv entity cryptographically owned by the seller&apos;s wallet. Only the owner can mark reserved, sold, or edit price.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Tamper-proof ownership
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Explicit available/reserved/sold status
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Pillar 3 */}
            <Card className="rounded-none border-0 shadow-none">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                  <Share2 className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">Multi-Storefront Portability</CardTitle>
                <CardDescription>
                  Publish once, appear everywhere. Competing storefronts read the same Arkiv entities without permission from FreshMarket.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Zero database siloing
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Proof via standalone reader app
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Architecture Showcase */}
      <section className="w-full border-t editorial-rule py-16 md:py-24">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-[#191b18] p-8 text-white md:p-14 flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="space-y-4 max-w-xl text-left">
              <Badge variant="outline" className="text-xs border-white/30 text-lime-200">
                Architecture Boundary
              </Badge>
              <h3 className="text-3xl md:text-5xl font-bold tracking-[-.04em] text-white">
                Real Blockchain Database, Not a Mock
              </h3>
              <p className="text-sm md:text-base text-white/65">
                FreshMarket reads from Arkiv Rabdi testnet (Chain ID 7794095) using public client keys, while writes are signed directly by your Web3 wallet. No backend PostgreSQL is required as the authoritative catalog.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <Link href="/browse" className={buttonVariants({ className: "bg-emerald-700 hover:bg-emerald-800 text-white" })}>
                  Explore Listings
                </Link>
                <Link href="/sell" className={buttonVariants({ variant: "outline" })}>
                  Try Seller Flow
                </Link>
              </div>
            </div>

            <div className="w-full md:w-auto p-6 rounded-2xl border border-white/15 bg-white/5 font-mono text-xs text-white/60 space-y-2 shadow-sm">
              <div className="text-lime-200 font-semibold">Arkiv Entity Architecture</div>
              <div>Schema: <span className="text-foreground">freshmarket.listings.v2</span></div>
              <div>Network: <span className="text-foreground">Arkiv Rabdi (7794095)</span></div>
              <div>Lifecycle: <span className="text-foreground">Available → Reserved → Sold</span></div>
              <div>Expiry: <span className="text-foreground">Default 7 days (Renewable)</span></div>
              <div>Authority: <span className="text-foreground">Connected Seller Wallet</span></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
