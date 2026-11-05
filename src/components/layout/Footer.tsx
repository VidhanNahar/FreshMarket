import Link from "next/link";
import { Store, ExternalLink, ShieldCheck, Clock, Code2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full border-t border-border/40 bg-muted/20 py-8 mt-auto">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Col */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white">
                <Store className="h-4 w-4" />
              </div>
              <span className="font-bold text-foreground text-lg">FreshMarket</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              A wallet-owned, portable second-hand marketplace with time-limited listings.
              Built from scratch for ETHGlobal Mumbai 2026 on Arkiv Rabdi testnet.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-emerald-500" /> Auto-Expiring Listings
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Wallet-Owned Entities
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Marketplace</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/browse" className="hover:text-foreground transition-colors">
                  Browse Listings
                </Link>
              </li>
              <li>
                <Link href="/sell" className="hover:text-foreground transition-colors">
                  Sell an Item
                </Link>
              </li>
              <li>
                <Link href="/my-listings" className="hover:text-foreground transition-colors">
                  Seller Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Protocol Links */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Protocol & Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://hub.arkiv.network/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  Arkiv Hub <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://docs.arkiv.network/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  Arkiv Docs <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/VidhanNahar/FreshMarket"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Code2 className="h-3.5 w-3.5" /> GitHub Repository
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2026 FreshMarket Team (Vidhan Nahar & Dhairya). Open-source under MIT License.</p>
          <p>Target: Arkiv — Build on Arkiv (From Scratch) • Chain ID: 7794095</p>
        </div>
      </div>
    </footer>
  );
}
