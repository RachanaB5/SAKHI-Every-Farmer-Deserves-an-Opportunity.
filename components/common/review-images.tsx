"use client";

import { useState } from "react";
import { MediaImage } from "@/components/common/media-image";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Shows review photos as thumbnails that open into a larger view. */
export function ReviewImages({ images, label = "Review image" }: { images: string[]; label?: string }) {
  const [selected, setSelected] = useState<{ src: string; index: number } | null>(null);

  if (!images.length) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {images.map((src, index) => (
          <button
            key={`${src}-${index}`}
            type="button"
            className="relative size-20 overflow-hidden rounded-xl border bg-muted"
            aria-label={`Open ${label.toLowerCase()} ${index + 1}`}
            onClick={() => setSelected({ src, index })}
          >
            <MediaImage src={src} alt={`${label} ${index + 1}`} sizes="80px" />
          </button>
        ))}
      </div>
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-4xl gap-3 p-3 sm:p-5">
          <DialogTitle>{selected ? `${label} ${selected.index + 1}` : label}</DialogTitle>
          <DialogDescription className="sr-only">Expanded view of the selected review image.</DialogDescription>
          {selected && (
            <div className="relative h-[min(75vh,700px)] w-full overflow-hidden rounded-lg bg-muted">
              <MediaImage src={selected.src} alt={`${label} ${selected.index + 1}`} sizes="90vw" className="object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
