"use client";

import Link from "next/link";
import type { ListingPublishFlow, PublishPhase } from "@/hooks/use-publish-listing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getWalletErrorReason } from "@/lib/wallet/wallet-ui";

const messages: Record<PublishPhase, string> = {
  idle: "Ready to publish",
  preparing: "Preparing your listing…",
  signature: "Awaiting wallet signature…",
  pending: "Writing listing to Arkiv Rabdi…",
  verifying: "Verifying your listing through the public read client…",
  verified: "Listing published and publicly verified",
  "verification-delayed": "Listing confirmed; public verification is delayed",
  error: "Could not finish publishing",
};

/** Presentation only: the parent owns the hook, so closing this dialog never cancels a write. */
export function ListingPublishDialog({ flow, open, onOpenChange }: {
  flow: ListingPublishFlow; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{messages[flow.phase]}</DialogTitle>
        <DialogDescription>
          {flow.phase === "error"
            ? flow.txHash ? "A transaction was submitted. Check its status before creating another listing." : getWalletErrorReason(flow.error)
            : "Your wallet owns this listing on Arkiv Rabdi."}
        </DialogDescription>
      </DialogHeader>
      <div role="status" aria-live="polite" className="space-y-3 break-words text-sm">
        {flow.txHash && <p>Transaction: <a className="underline" href={`https://rabdi.explorer.arkiv.network/tx/${flow.txHash}`} target="_blank" rel="noreferrer">{flow.txHash}</a></p>}
        {flow.receipt && <>
          <p>Entity key: <code>{flow.receipt.entityKey}</code></p>
          <p>Creator: <code>{flow.creator}</code></p>
          <p>Expires at block: {flow.receipt.expiresAt.toString()}</p>
          {flow.estimatedExpiresAt !== null && <p>Estimated expiration: {new Date(flow.estimatedExpiresAt).toLocaleString()}</p>}
          <Link className="underline" href={`/listing/${flow.receipt.entityKey}`}>View listing</Link>
        </>}
        {flow.phase === "verification-delayed" && <>
          <p>The write is confirmed. Retry verification to check public availability without publishing again.</p>
          <Button type="button" onClick={() => void flow.retryVerification()}>Retry public verification</Button>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}
