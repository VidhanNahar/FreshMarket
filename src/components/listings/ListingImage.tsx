"use client";

import { useEffect, useState } from "react";
import { imageSource } from "@/lib/swarm/media";
import { ImageOff } from "lucide-react";

export function ListingImage({ src, title, full = false }: { src: string; title: string; full?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const resolved = imageSource(src);
  const [loadedSrc, setLoadedSrc] = useState<string>();
  useEffect(() => {
    if (!full || !resolved || loadedSrc === src) return;
    const timer = setTimeout(() => setFailedSrc(src), 15_000);
    return () => clearTimeout(timer);
  }, [full, resolved, loadedSrc, src]);
  return (
    <div className={`flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted ${full ? "rounded-2xl border border-border" : "border-b border-border"}`}>
      {resolved && failedSrc !== src ? (
        // Public listings can reference any HTTPS host; load directly without a server image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolved} alt={title} loading={full ? "eager" : "lazy"} referrerPolicy="no-referrer"
          className={`h-full w-full transition-opacity duration-300 ${loadedSrc === src ? "opacity-100" : "opacity-0"} ${full ? "object-contain" : "object-cover"}`} onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)} />
      ) : (
        <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImageOff aria-hidden="true" className="h-8 w-8" />Image unavailable</span>
      )}
    </div>
  );
}
