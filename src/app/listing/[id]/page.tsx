import Link from "next/link";
import { ArrowLeft, Clock, ShieldCheck, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

interface ListingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { id } = await params;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Back Link */}
      <div className="mb-6">
        <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Browse
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Left Col: Image / Visual */}
        <div className="space-y-4">
          <div className="aspect-[4/3] rounded-2xl bg-muted/40 border border-border flex flex-col items-center justify-center relative overflow-hidden shadow-sm">
            <span className="text-sm text-muted-foreground flex items-center gap-2 font-mono">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              Arkiv Entity Visual Preview
            </span>
            <div className="absolute top-4 right-4">
              <Badge className="bg-emerald-600 text-white">Available</Badge>
            </div>
          </div>

          {/* Arkiv Entity Verification Card */}
          <Card className="border-border/60 bg-muted/20 text-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Arkiv Testnet Record
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entity Key:</span>
                <span className="text-foreground truncate max-w-[200px]">{id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network:</span>
                <span className="text-foreground">Arkiv Rabdi (7794095)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Schema:</span>
                <span className="text-foreground">freshmarket.listings</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Listing Details */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">Electronics</Badge>
              <Badge variant="outline" className="text-xs">Mumbai</Badge>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
              Sample Item for ID: {id}
            </h1>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-3">
              ₹18,500
            </div>
          </div>

          <div className="rounded-xl border border-border p-4 bg-card flex items-center gap-3">
            <Clock className="h-5 w-5 text-emerald-500 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-foreground">Cryptographic Expiration</p>
              <p className="text-muted-foreground">This listing will automatically expire in 5 days unless extended by the seller.</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Product Description</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This is a placeholder listing detail view. In Phase 3, this route will fetch the live entity from Arkiv using <code>ArkivListingRepository.getById(&quot;{id}&quot;)</code> and render the exact onchain data signed by the seller.
            </p>
          </div>

          <div className="pt-6 border-t border-border space-y-3">
            <div className="text-xs text-muted-foreground">
              Seller: <code className="font-mono text-foreground">0x147916961B8828003c7253fa5647345731f320F2</code>
            </div>

            <div className="flex gap-3">
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                Contact Seller
              </Button>
              <Button variant="outline" size="icon">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              FreshMarket is peer-to-peer. Offline handoff and inspection recommended.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
