import Link from "next/link";
import { Store, ExternalLink, ShieldCheck, Clock, Code2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-auto w-full border-t editorial-rule bg-[#191b18] py-10 text-white">
      <div className="container mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-10">
        <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Brand Col */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[#191b18]">
                <Store className="h-4 w-4" />
              </div>
              <span className="text-xl font-bold tracking-[-.04em] text-white">FreshMarket</span>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-white/55">
              A second-hand marketplace where every listing belongs to its seller&apos;s wallet
              and expires on its own when its time is up.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-white/55">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-emerald-500" /> Listings that expire
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Owned by the seller
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Marketplace</h4>
            <ul className="space-y-2 text-sm text-white/55">
              <li>
                <Link href="/browse" className="hover:text-white transition-colors">
                  Browse listings
                </Link>
              </li>
              <li>
                <Link href="/sell" className="hover:text-white transition-colors">
                  Sell an item
                </Link>
              </li>
              <li>
                <Link href="/my-listings" className="hover:text-white transition-colors">
                  My listings
                </Link>
              </li>
            </ul>
          </div>

          {/* Protocol Links */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Resources</h4>
            <ul className="space-y-2 text-sm text-white/55">
              <li>
                <a
                  href="https://hub.arkiv.network/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-white transition-colors"
                >
                  Arkiv Hub <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://docs.arkiv.network/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-white transition-colors"
                >
                  Arkiv Docs <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/VidhanNahar/FreshMarket"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-white transition-colors"
                >
                  <Code2 className="h-3.5 w-3.5" /> Source code
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/15 pt-6 text-xs text-white/40 sm:flex-row">
          <p>© 2026 FreshMarket. Open source under the MIT License.</p>
          <p>Running on test networks. No real funds are used.</p>
        </div>
      </div>
    </footer>
  );
}
