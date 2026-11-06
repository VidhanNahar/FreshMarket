"use client";

import { useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import {
  PlusCircle,
  Wallet,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Image as ImageIcon,
  MapPin,
  Tag,
  AlertCircle,
  Eye,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SwarmUpload } from "@/components/swarm/SwarmUpload";
import { imageSource } from "@/lib/swarm/media";
import { expiryDemoPreset } from "@/domain/expiry-demo";
import { usePublishListing } from "@/hooks/use-publish-listing";
import { ListingPublishDialog } from "@/components/listings/ListingPublishDialog";
import {
  listingFormSchema,
  ListingFormValues,
  toCreateListingInput,
  LISTING_CATEGORIES,
  EXPIRATION_DAYS_OPTIONS,
} from "@/domain/listing-schema";
import {
  shortenAddress,
  isRabdiChain,
  RABDI_CHAIN_ID,
  RABDI_CHAIN_NAME,
} from "@/lib/wallet/wallet-ui";

const emptySubscribe = () => () => {};

function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

const DEFAULT_FORM_VALUES: ListingFormValues = {
  title: "",
  description: "",
  category: "Electronics",
  price: 0,
  currency: "INR",
  city: "",
  imageUrl: "",
  expirationDays: 7,
};

export default function SellPage() {
  const isMounted = useIsMounted();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const [mediaBusy, setMediaBusy] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const publishing = usePublishListing();
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  const {
    register,
    setValue,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: "onChange",
  });

  // useWatch subscribes to preview fields without useForm.watch's compiler limitation.
  const [watchedTitle, watchedPrice, watchedCategory, watchedCity,
    watchedImageUrl, watchedExpirationDays, watchedDescription] = useWatch({
    control,
    name: ["title", "price", "category", "city", "imageUrl", "expirationDays", "description"],
  });

  // Associate failure with its URL; editing the URL naturally clears the visible error.
  const imageError = Boolean(watchedImageUrl && failedImageUrl === watchedImageUrl);

  const onFormSubmit = async (data: ListingFormValues) => {
    if (mediaBusy) { toast.error("Wait for the image upload to finish."); return; }
    if (!isConnected || !address) {
      toast.error("Please connect your wallet before publishing to Arkiv.");
      openConnectModal?.();
      return;
    }

    if (!isRabdiChain(chainId)) {
      toast.error(`Please switch your wallet to ${RABDI_CHAIN_NAME} (Chain ID ${RABDI_CHAIN_ID}).`);
      switchChain?.({ chainId: RABDI_CHAIN_ID });
      return;
    }

    // Form validation belongs to #6; the publishing hook owns wallet and public-read states.
    setPublishDialogOpen(true);
    try {
      await publishing.submit(toCreateListingInput(data, address));
    } catch {
      // Keep the dialog/transaction hash available even when confirmation fails.
      // The hook never retries a write automatically.
    }
  };

  const handleReset = () => {
    // Never discard the only in-memory record of an unresolved submitted transaction.
    if (publishing.isPending || (publishing.txHash && !publishing.receipt)) {
      setPublishDialogOpen(true);
      return;
    }
    publishing.reset();
    reset(DEFAULT_FORM_VALUES);
    setFailedImageUrl(null);
    toast.info("Form reset to default values.");
  };

  const isWalletConnected = isMounted && isConnected && Boolean(address);
  const isOnRabdi = isMounted && isRabdiChain(chainId);

  return (
    <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Page Header */}
      <div className="pb-6 border-b border-border/40">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold mb-1">
          <PlusCircle className="h-4 w-4" />
          Seller Publishing Flow
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Create a New Listing
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Publish second-hand items directly to the decentralized <strong>Arkiv Rabdi</strong> testnet.
          Your connected wallet cryptographically owns the entity and governs its lifecycle.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={mediaBusy || publishing.isPending || Boolean(publishing.txHash)} onClick={() => {
          reset(expiryDemoPreset);
          setFailedImageUrl(null);
          toast.info("15-minute demo preset loaded. Review it before publishing.");
        }}>Load 15-minute expiry demo</Button>
        <p className="text-xs text-muted-foreground">Loads a disposable test listing. Publishing still requires your approval in the wallet.</p>
      </div>

      {/* Wallet State Banner */}
      <div className="mt-6">
        {!isWalletConnected ? (
          <div
            data-testid="wallet-disconnected-banner"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 dark:text-amber-200"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Wallet Connection Required for Writes</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Arkiv requires an onchain transaction signed by your wallet to create and own the entity.
                  Connect your wallet on <strong>{RABDI_CHAIN_NAME}</strong> (Chain ID {RABDI_CHAIN_ID}).
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={openConnectModal}
              className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 shrink-0 w-full sm:w-auto"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </Button>
          </div>
        ) : !isOnRabdi ? (
          <div
            data-testid="wallet-wrong-network-banner"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-rose-900 dark:text-rose-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Wrong Network Connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connected wallet is on chain ID <code>{chainId ?? "Unknown"}</code>. Switch to{" "}
                  <strong>{RABDI_CHAIN_NAME}</strong> (Chain ID {RABDI_CHAIN_ID}) to write listings.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => switchChain?.({ chainId: RABDI_CHAIN_ID })}
              variant="destructive"
              className="gap-2 shrink-0 w-full sm:w-auto"
            >
              Switch to Rabdi
            </Button>
          </div>
        ) : (
          <div
            data-testid="wallet-connected-banner"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center justify-between gap-3 text-emerald-900 dark:text-emerald-200"
          >
            <div className="flex items-center gap-2.5 text-xs sm:text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Connected as seller: <strong className="font-mono">{shortenAddress(address)}</strong> on{" "}
                <span className="font-semibold">{RABDI_CHAIN_NAME}</span>.
              </span>
            </div>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hidden sm:inline-flex">
              Chain ID {RABDI_CHAIN_ID}
            </Badge>
          </div>
        )}
      </div>

      {/* Grid: Form (Left) & Live Preview (Right) */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form */}
        <div className="lg:col-span-7">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Listing Details</CardTitle>
                  <CardDescription>
                    Fill in item information. Indexed attributes will be queryable across all Arkiv-enabled storefronts.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <form id="seller-listing-form" onSubmit={handleSubmit(onFormSubmit)} className="space-y-5">
                {/* Title */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="title" className="text-sm font-semibold">
                      Listing Title <span className="text-rose-500">*</span>
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {(watchedTitle || "").length} / 80
                    </span>
                  </div>
                  <Input
                    id="title"
                    placeholder="e.g. Sony WH-1000XM5 Noise Canceling Headphones"
                    {...register("title")}
                    aria-invalid={Boolean(errors.title)}
                    aria-describedby={errors.title ? "title-error" : undefined}
                  />
                  {errors.title && (
                    <p id="title-error" className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.title.message}
                    </p>
                  )}
                </div>

                {/* Category & Price Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Category */}
                  <div className="space-y-1.5">
                    <Label htmlFor="category" className="text-sm font-semibold flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                      Category <span className="text-rose-500">*</span>
                    </Label>
                    <select
                      id="category"
                      {...register("category")}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
                      aria-invalid={Boolean(errors.category)}
                    >
                      {LISTING_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat} className="bg-background text-foreground">
                          {cat}
                        </option>
                      ))}
                    </select>
                    {errors.category && (
                      <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {errors.category.message}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="space-y-1.5">
                    <Label htmlFor="price" className="text-sm font-semibold">
                      Price (₹ INR) <span className="text-rose-500">*</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                        ₹
                      </span>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="12500"
                        className="pl-7"
                        {...register("price", { valueAsNumber: true })}
                        aria-invalid={Boolean(errors.price)}
                        aria-describedby={errors.price ? "price-error" : undefined}
                      />
                    </div>
                    {errors.price ? (
                      <p id="price-error" className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {errors.price.message}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Stored in minor units:{" "}
                        <strong className="font-mono">
                          {Math.round((Number(watchedPrice) || 0) * 100).toLocaleString("en-IN")}
                        </strong>{" "}
                        paisa
                      </p>
                    )}
                  </div>
                </div>

                {/* City & Expiration Period Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* City */}
                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-sm font-semibold flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      City / Metro <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="city"
                      placeholder="e.g. Mumbai, Bengaluru"
                      {...register("city")}
                      aria-invalid={Boolean(errors.city)}
                      aria-describedby={errors.city ? "city-error" : undefined}
                    />
                    {errors.city ? (
                      <p id="city-error" className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {errors.city.message}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Broad city name only. Never enter private street addresses.
                      </p>
                    )}
                  </div>

                  {/* Expiration Period */}
                  <div className="space-y-1.5">
                    <Label htmlFor="expirationDays" className="text-sm font-semibold flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      Listing Duration <span className="text-rose-500">*</span>
                    </Label>
                    <select
                      id="expirationDays"
                      {...register("expirationDays", { valueAsNumber: true })}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
                      aria-invalid={Boolean(errors.expirationDays)}
                    >
                      {EXPIRATION_DAYS_OPTIONS.map((days) => (
                        <option key={days} value={days} className="bg-background text-foreground">
                          {days < 1 ? "15 minutes (expiry demo)" : `${days} Days ${days === 7 ? "(Default / Recommended)" : ""}`}
                        </option>
                      ))}
                    </select>
                    {errors.expirationDays && (
                      <p className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {errors.expirationDays.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Image URL */}
                <div className="space-y-1.5">
                  <Label htmlFor="imageUrl" className="text-sm font-semibold flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Product Image URL <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    placeholder="https://images.unsplash.com/photo-1505740420928-5e560c06d30e"
                    {...register("imageUrl")}
                    aria-invalid={Boolean(errors.imageUrl)}
                    aria-describedby={errors.imageUrl ? "imageUrl-error" : undefined}
                  />
                  {errors.imageUrl ? (
                    <p id="imageUrl-error" className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.imageUrl.message}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      HTTPS image URL or public bzz:// reference. Uploaded image content is public.
                    </p>
                  )}
                </div>

                <SwarmUpload onBusyChange={setMediaBusy} onUploaded={(reference) => setValue("imageUrl", reference, { shouldValidate: true, shouldDirty: true })} />

                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="description" className="text-sm font-semibold">
                      Item Description <span className="text-rose-500">*</span>
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {(watchedDescription || "").length} / 1000
                    </span>
                  </div>
                  <textarea
                    id="description"
                    rows={4}
                    placeholder="Describe item condition, inclusions, reason for sale, and pickup options..."
                    {...register("description")}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
                    aria-invalid={Boolean(errors.description)}
                    aria-describedby={errors.description ? "description-error" : undefined}
                  />
                  {errors.description && (
                    <p id="description-error" className="text-xs text-rose-500 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {errors.description.message}
                    </p>
                  )}
                </div>

                {/* Submit Area */}
                <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-emerald-500" />
                    Entity lifetime: {watchedExpirationDays && watchedExpirationDays < 1 ? "15 minutes (demo)" : `${watchedExpirationDays || 7} days`} on Rabdi
                  </div>

                  {!isWalletConnected ? (
                    <Button
                      type="button"
                      onClick={openConnectModal}
                      className="bg-amber-600 hover:bg-amber-700 text-white gap-2 w-full sm:w-auto"
                    >
                      <Wallet className="h-4 w-4" />
                      Connect Wallet to Publish
                    </Button>
                  ) : !isOnRabdi ? (
                    <Button
                      type="button"
                      onClick={() => switchChain?.({ chainId: RABDI_CHAIN_ID })}
                      variant="destructive"
                      className="gap-2 w-full sm:w-auto"
                    >
                      Switch Network to Publish
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={mediaBusy || isSubmitting || !publishing.canSubmit}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2 w-full sm:w-auto font-medium"
                    >
                      <Sparkles className="h-4 w-4" />
                      Publish Listing to Arkiv
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Marketplace Preview Card */}
        <div className="lg:col-span-5 sticky top-24">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Eye className="h-3.5 w-3.5 text-emerald-500" />
              Live Marketplace Preview
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Instant Live Preview
            </div>
          </div>

          <Card className="border-border/60 shadow-md overflow-hidden bg-card transition-all">
            {/* Image Preview Container */}
            <div className="relative aspect-video w-full bg-muted/40 overflow-hidden flex items-center justify-center border-b border-border/40">
              {watchedImageUrl && imageSource(watchedImageUrl) && !imageError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageSource(watchedImageUrl || "") || undefined}
                  alt={watchedTitle || "Product preview"}
                  onError={() => setFailedImageUrl(watchedImageUrl)}
                  className="w-full h-full object-cover transition-opacity duration-300"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                  <ImageIcon className="h-10 w-10 stroke-[1.5] text-muted-foreground/50 mb-2" />
                  <p className="text-xs font-medium">
                    {imageError ? "Image failed to load (check URL)" : "Enter an image URL for live preview"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    Supports JPG, PNG, WEBP, or public CDN links
                  </p>
                </div>
              )}

              {/* Floating Badges */}
              <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="backdrop-blur-md bg-background/80 text-xs shadow-xs font-medium">
                  {watchedCategory || "Category"}
                </Badge>
              </div>

              <div className="absolute top-3 right-3">
                <Badge className="bg-emerald-700/90 hover:bg-emerald-700 text-white text-[11px] backdrop-blur-md shadow-xs">
                  Available
                </Badge>
              </div>
            </div>

            {/* Card Content */}
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-2xl font-extrabold text-foreground tracking-tight">
                  ₹ {(Number(watchedPrice) || 0).toLocaleString("en-IN")}
                </h3>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {watchedExpirationDays && watchedExpirationDays < 1 ? "15 min demo" : `${watchedExpirationDays || 7}d expiry`}
                </span>
              </div>

              <CardTitle className="text-base font-semibold text-foreground line-clamp-1 mt-1">
                {watchedTitle?.trim() || "Item title will appear here..."}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 pb-4">
              <p className="text-xs text-muted-foreground line-clamp-2 min-h-8">
                {watchedDescription?.trim() || "Detailed item description, condition, and reason for sale..."}
              </p>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{watchedCity?.trim() || "City location"}</span>
                </div>
                <div className="flex items-center gap-1 font-mono text-[11px]">
                  <Wallet className="h-3 w-3 text-muted-foreground" />
                  <span>
                    {isWalletConnected ? shortenAddress(address) : "0x... (disconnected)"}
                  </span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="bg-muted/30 border-t border-border/40 py-2.5 px-4 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Arkiv Rabdi Schema: <code>freshmarket.listings</code></span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">Time-Limited</span>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Closing status does not cancel the wallet transaction or discard its receipt. */}
      {publishing.phase !== "idle" && (
        <Button type="button" variant="outline" className="mt-6" onClick={() => setPublishDialogOpen(true)}>
          View publishing status
        </Button>
      )}
      <ListingPublishDialog flow={publishing} open={publishDialogOpen} onOpenChange={setPublishDialogOpen} />
    </div>
  );
}
