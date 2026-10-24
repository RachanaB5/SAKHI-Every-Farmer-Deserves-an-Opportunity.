// Brand photography from lib/photos.ts with one consistent treatment:
// rounded frame, average-colour backdrop and blurred placeholder while it
// loads, responsive cropping via `position`, and an optional scrim so text
// laid over it stays readable. Size the frame with `className`.
import Image from "next/image";
import { PHOTOS, type PhotoName } from "@/lib/photos";
import { cn } from "@/lib/utils";

const SCRIM = {
  none: "",
  bottom: "bg-gradient-to-t from-black/70 via-black/15 to-transparent",
  left: "bg-gradient-to-r from-black/75 via-black/45 to-black/10",
  full: "bg-black/35",
} as const;

/**
 * @param name - key in PHOTOS
 * @param sizes - responsive `sizes` hint for next/image
 * @param position - CSS object-position, to keep the subject in frame when cropped
 * @param scrim - gradient laid over the photo for legible text
 * @param decorative - hide from screen readers (use when a caption already describes it)
 */
export function Photo({
  name,
  sizes = "(max-width: 768px) 100vw, 50vw",
  position = "center",
  scrim = "none",
  priority,
  decorative,
  className,
  imgClassName,
}: {
  name: PhotoName;
  sizes?: string;
  position?: string;
  scrim?: keyof typeof SCRIM;
  priority?: boolean;
  decorative?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  const p = PHOTOS[name];
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ backgroundColor: p.color }}>
      <Image
        src={p.src}
        alt={decorative ? "" : p.alt}
        fill
        sizes={sizes}
        priority={priority}
        placeholder="blur"
        blurDataURL={p.blur}
        className={cn("object-cover", imgClassName)}
        style={{ objectPosition: position }}
      />
      {scrim !== "none" && <div aria-hidden className={cn("absolute inset-0", SCRIM[scrim])} />}
    </div>
  );
}
