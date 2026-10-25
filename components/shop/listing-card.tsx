// Product card for the shop grid: photo with harvest age, visual-quality
// ring and admin "Verified" badge, farmer line with distance, price and
// add-to-cart.
"use client";

import { BadgeCheck, Leaf } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { MediaImage } from "@/components/common/media-image";
import { cropName } from "@/lib/crops";
import { formatINR, harvestAge, harvestAgeShort } from "@/lib/format";
import type { SerializedListing } from "@/lib/listings";
import { cn } from "@/lib/utils";
import { AddToCart } from "./add-to-cart";

/** Small ring showing the visual score. */
export function QualityRing({ score, className }: { score: number | null; className?: string }) {
  if (score === null) return null;
  const r = 9;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? "var(--lime)" : score >= 70 ? "var(--warning)" : "var(--tomato)";
  return (
    <span className={cn("glass inline-flex h-7 items-center gap-1.5 rounded-full pr-2.5 pl-1 text-xs font-semibold", className)} title="Visual assessment score (not a certification)">
      <svg viewBox="0 0 24 24" className="size-5 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
        <circle cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="tabular">{score}</span>
    </span>
  );
}

/**
 * @param href - detail route (shop or bulk browse)
 * @param bulk - bulk-buyer quantity steps
 * @param index - stagger order for the entrance animation
 */
export function ListingCard({ listing, href, bulk = false, index = 0 }: { listing: SerializedListing; href: string; bulk?: boolean; index?: number }) {
  const low = listing.availableQty <= (listing.unit === "kg" ? 10 : 5);
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.035, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="group relative flex flex-col overflow-hidden rounded-3xl border bg-card transition-shadow hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.35)]"
    >
      <Link href={href} className="absolute inset-0 z-10" aria-label={`${listing.title} by ${listing.farmer.name}`} />
      <div data-fly-from className="relative aspect-[4/3] overflow-hidden bg-muted">
        {listing.imageUrl && (
          <MediaImage
            src={listing.imageUrl}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
            className="transition-transform duration-700 group-hover:scale-105"
          />
        )}
        <span className="glass absolute top-2 left-2 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium" title={harvestAge(listing.harvestDate)}>
          <Leaf className="size-3" /> {harvestAgeShort(listing.harvestDate)}
        </span>
        <QualityRing score={listing.quality.score} className="absolute top-2 right-2" />
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-foreground/85 px-2 py-0.5 text-[10px] font-medium text-background">
          <BadgeCheck className="size-3" /> Verified
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="leading-tight font-semibold break-words">
            {cropName(listing.crop)}
            {listing.grade === "A" && <span className="ml-1.5 rounded-md bg-lime/40 px-1.5 text-[11px] font-semibold">A</span>}
          </h3>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground break-words">
            {listing.farmer.name} · {listing.farmer.village}
            {listing.distanceKm !== null && ` · ${Math.round(listing.distanceKm)} km`}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="tabular text-lg leading-none font-semibold">
              {formatINR(listing.price)}
              <span className="text-xs font-normal text-muted-foreground">/{listing.unit}</span>
            </p>
            <p className={cn("mt-1 text-[11px]", low ? "font-medium text-tomato" : "text-muted-foreground")}>
              {low ? `Only ${listing.availableQty} left` : `${listing.availableQty} ${listing.unit} left`}
            </p>
          </div>
          <AddToCart listing={listing} bulk={bulk} className="relative z-20" />
        </div>
      </div>
    </motion.article>
  );
}
