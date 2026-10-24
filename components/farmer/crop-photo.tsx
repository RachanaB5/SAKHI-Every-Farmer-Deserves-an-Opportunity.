// Photo header for the farmer's harvest and listing grid cards: their own
// photo when there is one, else the crop's stock photo, with chips and a
// delete button laid over it. Same look as the shop's product cards.
import { Loader2, Sprout, Trash2 } from "lucide-react";
import { MediaImage } from "@/components/common/media-image";
import { CROPS, isCropSlug } from "@/lib/crops";

/** Two columns on phones, up to four on wide screens (the shop's grid). */
export const CARD_GRID = "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4";

/** Shared card frame; `group` drives the photo's hover zoom. */
export const CARD = "group relative flex flex-col overflow-hidden rounded-3xl border bg-card transition-shadow hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.35)]";

/** Near-solid backing for coloured pills on a photo; glass washes out on bright produce. */
export const PHOTO_CHIP = "rounded-full bg-background/90 shadow-sm backdrop-blur-sm";

/** Best photo of a harvest: one the farmer took before a frame cut from their video. */
export function coverOf(media: { type: string; url: string; isFrame: boolean }[]): string | null {
  return (media.find((m) => m.type === "IMAGE" && !m.isFrame) ?? media.find((m) => m.type === "IMAGE"))?.url ?? null;
}

/**
 * 4:3 photo across the top of a card.
 * @param src - the farmer's own photo; falls back to the crop's stock photo
 * @param children - overlays (chips, the delete button)
 */
export function CropPhoto({ crop, src, children }: { crop: string; src: string | null; children?: React.ReactNode }) {
  const url = src ?? (isCropSlug(crop) ? CROPS[crop].image : null);
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
      {url ? (
        <MediaImage
          src={url}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
          className="transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
        />
      ) : (
        <div className="grid size-full place-items-center bg-lime/25">
          <Sprout className="size-10 text-foreground/40" />
        </div>
      )}
      {children}
    </div>
  );
}

/** Round delete button for the photo's top-right corner (the card must be `relative`). */
export function PhotoDeleteButton({ label, busy, onClick }: { label: string; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="absolute top-2 right-2 z-10 grid size-10 place-items-center rounded-full bg-background/90 text-destructive shadow-sm backdrop-blur-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-[18px] animate-spin" /> : <Trash2 className="size-[18px]" />}
    </button>
  );
}
