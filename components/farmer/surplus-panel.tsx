// Surplus rescue panel: at-risk listings with a shelf-life meter, sell-
// through and reasons, AI (or offline) advice, and one-click actions —
// offer to an open demand (community kitchens first) or drop the price.
// Nothing moves automatically: every action is the farmer's tap.
"use client";

import { Check, HandHeart, Leaf, Loader2, Recycle, Send, Store, TrendingDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AISourceBadge, IndicativeTag } from "@/components/ai/ai-labels";
import { Countdown } from "@/components/bulk/deadline";
import { MediaImage } from "@/components/common/media-image";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { cropName } from "@/lib/crops";
import { fetcher, sendJSON } from "@/lib/fetcher";
import { formatQty, unitName } from "@/lib/format";
import type { SurplusItem, SurplusSuggestion } from "@/lib/surplus";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useI18n>["t"];

/** Why a listing is at risk, worded in the UI language from the detector's codes. */
function reasonLines(item: SurplusItem, t: T, lang: ReturnType<typeof useI18n>["lang"]): string[] {
  const crop = cropName(item.crop, lang);
  return item.reasonCodes.map((code) => {
    if (code === "slow") return t("surplus.reasonSlow", { pct: item.sellThrough, hours: item.hoursListed });
    if (code === "ageing") {
      return item.harvestAgeDays < 1
        ? t("surplus.reasonAgeToday", { crop, days: item.shelfLifeDays })
        : t("surplus.reasonAge", { n: Math.round(item.harvestAgeDays * 10) / 10, crop, days: item.shelfLifeDays });
    }
    return t("surplus.reasonUnsold", { qty: formatQty(item.available, item.unit, lang) });
  });
}

/** /farmer/surplus */
export function SurplusPanel() {
  const { t, lang } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<SurplusItem[]>("/api/surplus");
  useLive(["demand.updated", "offer.updated", "inventory.updated"], () => mutate());
  const atRisk = data?.filter((d) => d.atRisk) ?? [];
  const healthy = data?.filter((d) => !d.atRisk) ?? [];

  return (
    <div>
      <PageHeader title={t("surplus.title")} description={t("surplus.desc")} />
      {isLoading && <SkeletonRows count={3} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data && atRisk.length === 0 && <EmptyState icon={Leaf} title={t("surplus.emptyTitle")} body={t("surplus.emptyBody")} />}
      <ul className="space-y-4">
        {atRisk.map((item, i) => (
          <SurplusCard key={item.listingId} item={item} index={i} onChange={() => mutate()} />
        ))}
      </ul>
      {healthy.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("surplus.sellingFine")}</h2>
          <ul className="flex flex-wrap gap-2">
            {healthy.map((h) => (
              <li key={h.listingId} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
                <Check className="size-3.5 text-success" /> {cropName(h.crop, lang)} · {t("surplus.pctSold", { pct: h.sellThrough })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SurplusCard({ item, index, onChange }: { item: SurplusItem; index: number; onChange: () => void }) {
  const { t, lang } = useI18n();
  const { data: advice } = useSWR(["/api/ai/surplus", item.listingId], ([u, id]: [string, string]) =>
    fetcher<{ reasons: string[]; suggestions: string[]; source: string }>(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: id }) }),
  );
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const shelfUsed = Math.min(100, Math.round((item.harvestAgeDays / item.shelfLifeDays) * 100));
  // Model-written advice arrives in the farmer's language; the offline text is English,
  // so without the model other languages use the detector's own reason codes.
  const aiText = advice?.source === "ai";
  const unit = unitName(item.unit, lang);

  async function offer(s: Extract<SurplusSuggestion, { kind: "DEMAND" }>) {
    setBusy(s.demandId);
    try {
      const r = await sendJSON<{ qtyKg: number; pricePerKg: number; buyer: string }>("/api/surplus/offer", { listingId: item.listingId, demandId: s.demandId });
      toast.success(t("surplus.offeredToast", { kg: r.qtyKg, buyer: r.buyer, price: r.pricePerKg }));
      setDone((d) => [...d, s.demandId]);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function dropPrice(price: number) {
    setBusy("price");
    try {
      await sendJSON(`/api/listings/${item.listingId}`, { price }, "PATCH");
      toast.success(t("surplus.priceDropped", { price, unit }));
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.li initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} className="overflow-hidden rounded-3xl border bg-card">
      <div className="flex gap-4 p-4 sm:p-5">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-24">
          {item.imageUrl && <MediaImage src={item.imageUrl} sizes="96px" />}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 px-2 pt-4 pb-1 text-[10px] font-medium text-white">{t("surplus.pctSold", { pct: item.sellThrough })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold">{cropName(item.crop, lang)}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/25 px-2 py-0.5 text-xs font-semibold">
              <Recycle className="size-3" /> {t("surplus.atRisk")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("surplus.unsoldOf", { available: formatQty(item.available, item.unit, lang), total: formatQty(item.total, item.unit, lang) })} · ₹{item.price}/{unit}
          </p>
          <div className="mt-2">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{t("surplus.shelfUsed")}</span>
              <span className="tabular">{shelfUsed}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full"
                style={{ background: shelfUsed >= 85 ? "var(--tomato)" : shelfUsed >= 60 ? "var(--warning)" : "var(--lime)" }}
                initial={{ width: 0 }}
                animate={{ width: `${shelfUsed}%` }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t bg-muted/30 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("surplus.why")}</p>
          {advice && <AISourceBadge source={aiText ? "ai" : "fallback"} />}
        </div>
        <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
          {(aiText ? advice.reasons : reasonLines(item, t, lang)).map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" /> {r}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 p-4 sm:p-5">
        <p className="text-sm font-medium">{t("surplus.where")}</p>
        {item.suggestions.length === 0 && <p className="text-sm text-muted-foreground">{t("surplus.noDemand", { crop: cropName(item.crop, lang) })}</p>}
        <AnimatePresence initial={false}>
          {item.suggestions.map((s) => {
            if (s.kind === "DEMAND") {
              const sent = done.includes(s.demandId);
              const kitchen = s.orgType === "COMMUNITY_KITCHEN";
              return (
                <motion.div key={s.demandId} layout className={cn("flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center", kitchen && "border-lime bg-lime/10")}>
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", kitchen ? "bg-lime text-lime-foreground" : "bg-muted")}>
                    <HandHeart className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {s.buyer}
                      {s.urgent && <span className="ml-1.5 rounded-full bg-tomato px-1.5 text-[10px] font-semibold text-white uppercase">{t("bulk.urgent")}</span>}
                    </p>
                    <p className="text-muted-foreground">
                      {t("surplus.needs", { kg: s.remainingKg, price: s.targetPrice })} · <Countdown to={s.deadline} />
                      {s.distanceKm !== null && ` · ${Math.round(s.distanceKm)} km`}
                    </p>
                  </div>
                  <Button variant={sent ? "outline" : "brand"} disabled={sent || busy !== null} onClick={() => offer(s)}>
                    {busy === s.demandId ? <Loader2 className="animate-spin" /> : sent ? <Check /> : <Send />}
                    {sent ? t("surplus.offered") : t("surplus.offerBtn", { kg: s.offerQty, price: s.offerPrice })}
                  </Button>
                </motion.div>
              );
            }
            if (s.kind === "PRICE_DROP") {
              return (
                <div key="drop" className="flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                    <TrendingDown className="size-5" />
                  </span>
                  <p className="min-w-0 flex-1 text-sm">
                    {t("surplus.dropLabel", { price: s.price, unit })} <IndicativeTag className="ml-1" />
                  </p>
                  <Button variant="outline" onClick={() => dropPrice(s.price)} disabled={busy !== null}>
                    {busy === "price" && <Loader2 className="animate-spin" />} {t("surplus.dropTo", { price: s.price })}
                  </Button>
                </div>
              );
            }
            return (
              <div key="mandi" className="flex items-center gap-3 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
                <Store className="size-5 shrink-0" /> {t("surplus.mandiLabel", { mandi: s.mandi, price: Math.round(s.modalPrice), unit })}
              </div>
            );
          })}
        </AnimatePresence>
        {aiText && advice.suggestions.length > 0 && (
          <div className="rounded-2xl bg-muted/50 p-3 text-sm">
            <p className="mb-1 font-medium">{t("surplus.aiSuggests")}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              {advice.suggestions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.li>
  );
}
