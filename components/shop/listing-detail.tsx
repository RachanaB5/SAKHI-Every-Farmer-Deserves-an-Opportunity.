// Listing detail for buyers: photo gallery from the verified batch, price
// vs mandi, stock bar, delivery estimate, visual-quality evidence, farmer
// card, and more from this farmer / similar listings.
"use client";

import { ArrowLeft, BadgeCheck, MapPin, Repeat, Star, Timer, TrendingUp, Truck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { IndicativeTag } from "@/components/ai/ai-labels";
import { MediaImage } from "@/components/common/media-image";
import { ErrorState, SkeletonBlock } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { QualityCard } from "@/components/farmer/new-batch/quality-panel";
import { useLive } from "@/hooks/use-live";
import { QUALITY_DISCLAIMER } from "@/lib/ai/schemas";
import { cropName } from "@/lib/crops";
import { formatDate, formatINR, harvestAge } from "@/lib/format";
import type { SerializedListing } from "@/lib/listings";
import { cn } from "@/lib/utils";
import { AddToCart } from "./add-to-cart";
import { CartBar } from "./cart-bar";
import { ListingCard } from "./listing-card";
import { SubscribeSheet } from "./subscribe-sheet";

interface Detail extends SerializedListing {
  farmerRating: { average: number | null; count: number };
  market: { modalToday: number; mandi: string; suggested: number; trend: string } | null;
  moreFromFarmer: SerializedListing[];
  similar: SerializedListing[];
}

/**
 * @param backHref - where "back" goes (shop or bulk browse)
 * @param bulk - bulk-buyer quantity steps
 */
export function ListingDetail({ id, backHref = "/shop", detailBase = "/shop/listing", bulk = false }: { id: string; backHref?: string; detailBase?: string; bulk?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/listings/${id}`);
  const router = useRouter();
  useLive(["inventory.updated"], () => mutate());
  const [shot, setShot] = useState(0);
  const [repeat, setRepeat] = useState(false);

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonBlock className="aspect-[4/3] w-full rounded-3xl" />
        <div className="space-y-3">
          <SkeletonBlock className="h-10 w-2/3" />
          <SkeletonBlock className="h-6 w-1/2" />
          <SkeletonBlock className="h-40 w-full" />
        </div>
      </div>
    );
  }
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;

  const images = data.gallery.length ? data.gallery : data.imageUrl ? [data.imageUrl] : [];
  const pctLeft = Math.max(4, Math.round((data.availableQty / Math.max(1, data.totalQty)) * 100));
  const vsMarket = data.market ? Math.round(((data.price - data.market.modalToday) / data.market.modalToday) * 100) : null;

  return (
    <div className="pb-20 lg:pb-0">
      <Link href={backHref} className="mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        {/* Gallery */}
        <div>
          <div data-fly-from className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted">
            <AnimatePresence mode="wait">
              <motion.div key={images[shot]} initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                {images[shot] && <MediaImage src={images[shot]} sizes="(max-width: 1024px) 100vw, 640px" priority />}
              </motion.div>
            </AnimatePresence>
            <span className="glass absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-medium">{harvestAge(data.harvestDate)}</span>
          </div>
          {images.length > 1 && (
            <div className="mt-2 grid grid-cols-5 gap-2">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setShot(i)}
                  className={cn("relative aspect-square overflow-hidden rounded-xl ring-offset-2 ring-offset-background", i === shot ? "ring-2 ring-foreground" : "ring-1 ring-border")}
                  aria-label={`Photo ${i + 1}`}
                >
                  <MediaImage src={src} sizes="80px" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy box */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{cropName(data.crop)}</h1>
            {data.grade && <span className="rounded-lg bg-lime/40 px-2 py-0.5 text-sm font-semibold">Grade {data.grade}</span>}
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
            <BadgeCheck className="size-3.5" /> Verified by FoodFlow {data.quality.verifiedAt ? `on ${formatDate(data.quality.verifiedAt)}` : ""}
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-1">
            <p className="tabular text-4xl font-semibold tracking-tight">
              {formatINR(data.price)}
              <span className="text-base font-normal text-muted-foreground">/{data.unit}</span>
            </p>
            {data.market && (
              <p className="flex flex-wrap items-center gap-1.5 pb-1 text-sm text-muted-foreground">
                <TrendingUp className="size-4" /> {data.market.mandi} modal ₹{data.market.modalToday}
                {vsMarket !== null && <span>({vsMarket >= 0 ? "+" : ""}{vsMarket}% retail margin)</span>}
                <IndicativeTag />
              </p>
            )}
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                <span className="tabular font-semibold text-foreground">{data.availableQty} {data.unit}</span> left of {data.totalQty}
              </span>
              <span>{data.soldQty > 0 ? `${data.soldQty} ${data.unit} sold` : "Just listed"}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-lime" initial={{ width: 0 }} animate={{ width: `${pctLeft}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
            </div>
          </div>

          <div className="mt-6">
            <AddToCart listing={data} bulk={bulk} size="lg" />
            <p className="mt-2 text-center text-xs text-muted-foreground">Stock is reserved only when you confirm checkout.</p>
            {!bulk && (
              <>
                <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={() => setRepeat(true)}>
                  <Repeat /> Get this on repeat
                </Button>
                <SubscribeSheet open={repeat} onOpenChange={setRepeat} listing={data} onCreated={() => router.push("/shop/subscriptions")} />
              </>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border p-3">
              <Truck className="size-4 text-muted-foreground" />
              <p className="mt-1.5 font-medium">{data.etaHours ? `~${data.etaHours} h delivery` : "Delivery available"}</p>
              <p className="text-xs text-muted-foreground">{data.distanceKm !== null ? `${Math.round(data.distanceKm)} km from the farm` : data.area}</p>
            </div>
            <div className="rounded-2xl border p-3">
              <MapPin className="size-4 text-muted-foreground" />
              <p className="mt-1.5 font-medium">Self-pickup</p>
              <p className="text-xs text-muted-foreground">{data.farmer.village}. OTP or QR at handover</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {data.quality.score !== null ? (
          <QualityCard
            compact
            result={{
              score: data.quality.score,
              grade: (data.quality.grade as "A" | "B" | "C") ?? "B",
              flags: data.quality.flags,
              summary: data.quality.summary ?? "",
              disclaimer: QUALITY_DISCLAIMER,
              source: data.quality.source === "ai" ? "ai" : "fallback",
            }}
          />
        ) : (
          <div />
        )}
        <div className="rounded-3xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-lime text-lg font-semibold text-lime-foreground">
              {data.farmer.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{data.farmer.farmName ?? data.farmer.name}</p>
              <p className="text-sm text-muted-foreground">
                {data.farmer.name} · {data.farmer.village}
              </p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Reliability</dt>
              <dd className="tabular text-xl font-semibold">{Math.round(data.farmer.reliability * 100)}%</dd>
            </div>
            <div className="rounded-2xl bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Buyer rating</dt>
              <dd className="flex items-center gap-1 text-xl font-semibold">
                {data.farmerRating.average ?? "-"} <Star className="size-4 fill-warning text-warning" />
                <span className="text-xs font-normal text-muted-foreground">({data.farmerRating.count})</span>
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="size-3.5" /> Harvested {formatDate(data.harvestDate)} · listed {formatDate(data.createdAt)}
          </p>
        </div>
      </div>

      {data.moreFromFarmer.length > 0 && <Rail title={`More from ${data.farmer.name.split(" ")[0]}`} items={data.moreFromFarmer} detailBase={detailBase} bulk={bulk} />}
      {data.similar.length > 0 && <Rail title="Same crop, other farms" items={data.similar} detailBase={detailBase} bulk={bulk} />}
      <CartBar />
    </div>
  );
}

function Rail({ title, items, detailBase, bulk }: { title: string; items: SerializedListing[]; detailBase: string; bulk: boolean }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.slice(0, 4).map((l, i) => (
          <ListingCard key={l.id} listing={l} href={`${detailBase}/${l.id}`} bulk={bulk} index={i} />
        ))}
      </div>
    </section>
  );
}
