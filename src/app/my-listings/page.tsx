import { LayoutList, PlusCircle, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function MyListingsPage() {
  const tabs = ["All Listings (3)", "Available (2)", "Reserved (1)", "Sold (0)"];

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-1">
            <LayoutList className="h-4 w-4" />
            Seller Dashboard
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            My Arkiv Listings
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Manage your wallet-owned listings. Update prices, toggle status between available, reserved, and sold, or extend expiration.
          </p>
        </div>

        <Link href="/sell">
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            <PlusCircle className="h-4 w-4" />
            Create New Listing
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
        {tabs.map((tab, idx) => (
          <Button
            key={tab}
            variant={idx === 0 ? "default" : "ghost"}
            size="sm"
            className={idx === 0 ? "bg-muted text-foreground font-semibold hover:bg-muted" : "text-muted-foreground"}
          >
            {tab}
          </Button>
        ))}
      </div>

      {/* Placeholder Listing Table / Cards */}
      <div className="mt-8 space-y-4">
        {[
          { id: "0x4a1...9b2", title: "Sony WH-1000XM5 Headphones", price: "₹21,000", status: "Available", daysLeft: 5 },
          { id: "0x8f2...1c7", title: "Logitech MX Master 3S Mouse", price: "₹6,500", status: "Available", daysLeft: 2 },
          { id: "0x3e9...0d4", title: "Keychron K2 Mechanical Keyboard", price: "₹7,200", status: "Reserved", daysLeft: 6 },
        ].map((item) => (
          <Card key={item.id} className="border-border/60">
            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg text-foreground">{item.title}</h3>
                  <Badge
                    className={
                      item.status === "Available"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    }
                  >
                    {item.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Price: <strong className="text-foreground">{item.price}</strong></span>
                  <span>Entity Key: <code className="font-mono">{item.id}</code></span>
                  <span>Expires in: <strong>{item.daysLeft} days</strong></span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled>
                  <RefreshCw className="h-3.5 w-3.5" /> Extend Expiry
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Sold
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" disabled>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Notice about Phase 4 wiring */}
      <div className="mt-12 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground bg-muted/20">
        <p className="font-medium text-foreground">
          📊 Seller Lifecycle Management Scaffolded
        </p>
        <p className="mt-1 max-w-xl mx-auto">
          In <strong>Phase 4</strong>, this dashboard will query listings where <code>seller == connectedAddress</code> and execute owner mutations (`updateStatus`, `extendExpiry`, `deleteListing`).
        </p>
      </div>
    </div>
  );
}
