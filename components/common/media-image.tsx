// Image that works for every storage driver: next/image for files served
// from /public (seed photos, local uploads), plain <img> for inline data:
// URLs that the image optimiser can't fetch.
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Fills its (relative, sized) parent.
 * @param sizes - responsive sizes hint for next/image
 */
export function MediaImage({
  src,
  alt = "",
  sizes = "(max-width: 768px) 100vw, 50vw",
  className,
  priority,
}: {
  src: string;
  alt?: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  if (src.startsWith("data:") || src.startsWith("blob:")) {
    // eslint-disable-next-line @next/next/no-img-element -- inline/blob sources bypass the optimiser
    return <img src={src} alt={alt} className={cn("absolute inset-0 size-full object-cover", className)} />;
  }
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={cn("object-cover", className)} />;
}
