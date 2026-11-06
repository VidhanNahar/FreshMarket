"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

export function ListingImage({ src, title, full = false }: { src: string; title: string; full?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  let valid = false;
  try {
    const url = new URL(src);
    valid = url.protocol === "https:" && !url.username && !url.password;
  } catch { /* Render the same fallback for malformed and missing images. */ }
  return (
    <div className={`flex aspect-[4/3] items-center justify-center overflow-hidden bg-black/5 ${full ? "rounded-2xl border border-black/10" : "border-b border-black/10"}`}>
      {valid && failedSrc !== src ? (
        // Public listings can reference any HTTPS host; load directly without a server image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} loading={full ? "eager" : "lazy"} referrerPolicy="no-referrer"
          className={`h-full w-full ${full ? "object-contain" : "object-cover"}`} onError={() => setFailedSrc(src)} />
      ) : (
        <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImageOff aria-hidden="true" className="h-8 w-8" />Image unavailable</span>
      )}
    </div>
  );
}
