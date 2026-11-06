"use client";

import { BadgeCheck } from "lucide-react";
import { useSellerIdentity } from "@/hooks/use-seller-identity";
import { shortenAddress } from "@/lib/wallet/wallet-ui";

/** Address renders immediately. ENS work has its own query and never gates listing content. */
export function SellerIdentity({ address, profile = false }: { address: `0x${string}`; profile?: boolean }) {
  const query = useSellerIdentity(address);
  const identity = !query.isFetching && !query.isError ? query.data : null;
  return <span className={`inline-flex min-w-0 ${profile ? "flex-col items-start gap-2" : "items-center gap-1"}`}>
    <span title={address} className="inline-flex min-w-0 items-center gap-1">
      <span className="break-all">{identity?.name ?? shortenAddress(address)}</span>
      {identity && <BadgeCheck className="h-4 w-4 shrink-0 text-[#2f6fed]" role="img" aria-label="Sepolia ENS name, owner and forward address verified" />}
    </span>
    {profile && <>
      <code className="break-all text-xs text-muted-foreground">{address}</code>
      {identity?.avatar && <>
        {/* Only credential-free HTTPS URLs are allowed; no raw markup or data: SVG is rendered. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={identity.avatar} alt={`${identity.name} avatar`} loading="lazy" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full object-cover" />
      </>}
      {identity?.description && <span className="whitespace-pre-wrap break-words text-sm">{identity.description}</span>}
      {identity?.url && <a href={identity.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">Storefront website</a>}
      {identity && <span className="text-xs text-muted-foreground">ENS identity on Ethereum Sepolia; this is not a seller reputation score.</span>}
    </>}
  </span>;
}
