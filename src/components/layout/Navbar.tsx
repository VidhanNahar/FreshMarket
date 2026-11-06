"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, PlusCircle, LayoutList, Compass, Menu, Settings, X } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { WalletButton } from "@/components/wallet/WalletButton";
import { NetworkStatusBadge } from "@/components/wallet/NetworkStatusBadge";
import { RabdiNetworkGuard } from "@/components/wallet/RabdiNetworkGuard";

export function Navbar() {
  const pathname = usePathname();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/browse", label: "Browse", icon: Compass },
    { href: "/storefront", label: "Storefront B", icon: Store },
    { href: "/sell", label: "Sell Item", icon: PlusCircle },
    { href: "/my-listings", label: "My Listings", icon: LayoutList },
    { href: "/storefront/settings", label: "Storefront Settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-90 transition">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
              <Store className="h-5 w-5" />
            </div>
            <span className="font-extrabold text-foreground text-xl">FreshMarket</span>
          </Link>
          <Badge variant="outline" className="hidden sm:inline-flex border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
            Arkiv Rabdi Testnet
          </Badge>
        </div>

        {/* Desktop Nav */}
        <nav aria-label="Main navigation" className="hidden xl:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href === "/storefront/settings" && pathname === "/identity");
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-muted text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Action / Wallet Slot */}
        <div className="hidden xl:flex items-center gap-3">
          <NetworkStatusBadge />
          <WalletButton />
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="xl:hidden inline-flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          ref={menuButton}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Network / wallet status banners (wrong chain, missing wallet, low balance) */}
      <RabdiNetworkGuard />

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav id="mobile-navigation" aria-label="Mobile navigation" onKeyDown={(event) => { if (event.key === "Escape") { setMobileMenuOpen(false); menuButton.current?.focus(); } }} className="xl:hidden max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-border bg-background px-4 pt-2 pb-4 space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href === "/storefront/settings" && pathname === "/identity");
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-base font-medium ${
                  isActive
                    ? "bg-muted text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
          <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
            <span>Network</span>
            <NetworkStatusBadge className="inline-flex" />
          </div>
          <div className="pt-2 border-t border-border/50">
            <WalletButton fullWidth />
          </div>
        </nav>
      )}
    </header>
  );
}
