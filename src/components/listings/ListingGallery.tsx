"use client";

import { useState } from "react";
import { ListingImage } from "./ListingImage";

export function ListingGallery({ media, title }: { media: string[]; title: string }) {
  const [selection, setSelection] = useState<{ title: string; index: number }>({ title, index: 0 });
  const index = selection.title === title && selection.index < media.length ? selection.index : 0;
  return <section aria-label="Product photos" className="space-y-3">
    <ListingImage key={media[index]} src={media[index] ?? ""} title={`${title} — photo ${index + 1}`} full />
    {media.length > 1 && <div className="grid grid-cols-4 gap-3">{media.map((reference, position) => <button key={`${position}:${reference}`} type="button" aria-label={`Show photo ${position + 1}`} aria-pressed={position === index} onClick={() => setSelection({title, index: position})} className={`overflow-hidden rounded-xl border-2 transition ${position === index ? "border-primary" : "border-transparent opacity-65 hover:opacity-100"}`}><ListingImage src={reference} title={`${title} thumbnail ${position + 1}`} /></button>)}</div>}
    {media.length > 1 && <p className="text-xs text-muted-foreground">Photo {index + 1} of {media.length}</p>}
  </section>;
}
