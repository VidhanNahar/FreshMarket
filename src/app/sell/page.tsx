import { PlusCircle, Wallet, ShieldAlert, Clock, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SellPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Page Header */}
      <div className="pb-8 border-b border-border/40">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-1">
          <PlusCircle className="h-4 w-4" />
          Seller Publishing Flow
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Create a New Listing
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Publish your second-hand item directly to Arkiv Rabdi testnet. Your connected wallet will own the entity and control its lifecycle.
        </p>
      </div>

      {/* Disconnected Notice Placeholder */}
      <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3 text-sm text-amber-800 dark:text-amber-200">
        <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Wallet Connection Required for Writes</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Arkiv requires an onchain transaction signed by your wallet to create and own the entity. Connect your wallet on Arkiv Rabdi testnet (Chain ID 7794095) before publishing.
          </p>
        </div>
      </div>

      {/* Form Card Placeholder */}
      <Card className="mt-8 border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle>Listing Information</CardTitle>
          <CardDescription>
            Enter details for your item. All public fields will be indexed on Arkiv.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">Listing Title</Label>
              <Input id="title" placeholder="e.g. MacBook Pro 14-inch M2 Pro (2023) - 16GB RAM" disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price (₹ INR)</Label>
              <Input id="price" type="number" placeholder="85000" disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input id="category" placeholder="Electronics" disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City (Coarse public location)</Label>
              <Input id="city" placeholder="Mumbai, Maharashtra" disabled />
              <p className="text-xs text-muted-foreground">Never enter private street addresses.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry">Expiration Period</Label>
              <Input id="expiry" value="7 Days (Default)" disabled />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="imageUrl">Product Image URL</Label>
              <div className="flex gap-2">
                <Input id="imageUrl" placeholder="https://images.unsplash.com/photo-..." disabled />
                <Button variant="outline" size="icon" disabled>
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={4}
                disabled
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Describe item condition, inclusions, and reason for sale..."
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-between">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-emerald-500" />
              Listing will be valid for 7 days upon creation
            </div>
            <Button disabled className="bg-emerald-600 text-white gap-2">
              <Wallet className="h-4 w-4" />
              Connect Wallet to Publish
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Notice about Phase 2 wiring */}
      <div className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground bg-muted/20">
        <p className="font-medium text-foreground">
          ✍️ Seller Form Scaffolded
        </p>
        <p className="mt-1 max-w-xl mx-auto">
          In <strong>Phase 2</strong>, this form will be fully wired with React Hook Form + Zod validation and will execute <code>createEntity</code> via `@arkiv-network/sdk`.
        </p>
      </div>
    </div>
  );
}
