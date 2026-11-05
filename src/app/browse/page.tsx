import { Compass, Filter, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function BrowsePage() {
  const placeholderCategories = ["All Items", "Electronics", "Vehicles", "Furniture", "Books", "Fashion", "Other"];

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-8 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-1">
            <Compass className="h-4 w-4" />
            Public Marketplace Discovery
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Browse Active Listings
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Querying live, non-expired listings directly from Arkiv Rabdi testnet.
            No wallet connection required for buyers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            Phase 3 Ready • Arkiv Public Read
          </Badge>
        </div>
      </div>

      {/* Filter / Search Bar Placeholder */}
      <div className="mt-8 flex flex-col md:flex-row items-center gap-4">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search listings by title or city..." className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {placeholderCategories.slice(0, 5).map((category, idx) => (
            <Button
              key={category}
              variant={idx === 0 ? "default" : "outline"}
              size="sm"
              className={idx === 0 ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
            >
              {category}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5 ml-auto md:ml-0">
            <Filter className="h-3.5 w-3.5" /> More Filters
          </Button>
        </div>
      </div>

      {/* Placeholder Listings Grid */}
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item} className="overflow-hidden border-border/60 hover:shadow-md transition">
            <div className="aspect-[4/3] bg-muted/40 relative flex items-center justify-center border-b border-border/40">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                Arkiv Entity Preview #{item}
              </span>
              <div className="absolute top-2 right-2">
                <Badge className="bg-emerald-600/90 text-white text-xs">Available</Badge>
              </div>
            </div>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Electronics</span>
                <span>Mumbai</span>
              </div>
              <h3 className="font-semibold text-base text-foreground line-clamp-1">
                Sample Arkiv Second-Hand Item #{item}
              </h3>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-lg font-bold text-foreground">₹{(item * 1500).toLocaleString("en-IN")}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                Expires in {7 - item} days
              </div>
            </CardContent>
            <CardFooter className="p-4 pt-0 border-t border-border/20 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono truncate max-w-[130px]">0x71...c4b{item}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                View Details →
              </span>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Info notice about Phase 3 wiring */}
      <div className="mt-12 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground bg-muted/20">
        <p className="font-medium text-foreground">
          🔍 Marketplace Discovery Scaffolded
        </p>
        <p className="mt-1 max-w-xl mx-auto">
          In <strong>Phase 3</strong>, this view will be wired directly to `@arkiv-network/sdk` public client to query non-expired listings from schema <code>freshmarket.listings</code>.
        </p>
      </div>
    </div>
  );
}
