import Link from "next/link";
import { ArrowRight, Clock, ShieldCheck, Share2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full py-16 md:py-24 lg:py-32 bg-gradient-to-b from-emerald-500/5 via-transparent to-background">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
          <Badge
            variant="outline"
            className="mb-6 px-3.5 py-1 text-sm border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Built for ETHGlobal Mumbai 2026 • Arkiv Rabdi Testnet
          </Badge>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground max-w-4xl">
            Second-hand listings that{" "}
            <span className="text-emerald-600 dark:text-emerald-400">you own</span>, with{" "}
            <span className="underline decoration-emerald-500 decoration-wavy decoration-2">time limits</span>.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl">
            Traditional marketplaces trap your data in siloed platforms and accumulate stale listings.
            FreshMarket stores listings as wallet-owned entities on Arkiv with cryptographic expiration and multi-storefront portability.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/browse">
              <Button size="lg" className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 px-6 shadow-md">
                Browse Marketplace
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/sell">
              <Button size="lg" variant="outline" className="border-border hover:bg-muted gap-2 px-6">
                List an Item
              </Button>
            </Link>
          </div>

          {/* Quick Metrics / Guarantees */}
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-3xl text-left">
            <div className="p-4 rounded-xl border border-border/60 bg-card">
              <div className="text-2xl font-bold text-foreground">0%</div>
              <div className="text-xs text-muted-foreground mt-1">Platform lock-in on listings</div>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-card">
              <div className="text-2xl font-bold text-foreground">7 Days</div>
              <div className="text-xs text-muted-foreground mt-1">Default entity expiration</div>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-card">
              <div className="text-2xl font-bold text-foreground">2 Storefronts</div>
              <div className="text-xs text-muted-foreground mt-1">Independent portable readers</div>
            </div>
            <div className="p-4 rounded-xl border border-border/60 bg-card">
              <div className="text-2xl font-bold text-foreground">100%</div>
              <div className="text-xs text-muted-foreground mt-1">Wallet-controlled state</div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Pillars / Problem & Solution */}
      <section className="w-full py-16 md:py-20 border-t border-border/40 bg-muted/10">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Why Decentralized Second-Hand?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built on Arkiv Protocol to eliminate stale items, platform monopolies, and phantom availability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Pillar 1 */}
            <Card className="border-border/60 shadow-sm">
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
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No ghost inventory
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> One-click renewal by seller
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Pillar 2 */}
            <Card className="border-border/60 shadow-sm">
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
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Tamper-proof ownership
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Explicit available/reserved/sold status
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Pillar 3 */}
            <Card className="border-border/60 shadow-sm">
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
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Zero database siloing
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Proof via standalone reader app
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Architecture Showcase */}
      <section className="w-full py-16 md:py-20 border-t border-border/40">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.02] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl text-left">
              <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                Architecture Boundary
              </Badge>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                Real Blockchain Database, Not a Mock
              </h3>
              <p className="text-sm md:text-base text-muted-foreground">
                FreshMarket reads from Arkiv Rabdi testnet (Chain ID 7794095) using public client keys, while writes are signed directly by your Web3 wallet. No backend PostgreSQL is required as the authoritative catalog.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <Link href="/browse">
                  <Button variant="default" className="bg-emerald-700 hover:bg-emerald-800 text-white">
                    Explore Listings
                  </Button>
                </Link>
                <Link href="/sell">
                  <Button variant="outline">
                    Try Seller Flow
                  </Button>
                </Link>
              </div>
            </div>

            <div className="w-full md:w-auto p-6 rounded-xl border border-border bg-card/60 font-mono text-xs text-muted-foreground space-y-2 shadow-sm">
              <div className="text-emerald-500 font-semibold">Arkiv Entity Architecture</div>
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
