// Farmer "My listings": live / paused / sold-out tabs over a photo grid with
// stock split (sold · reserved · available), the live grade (photo score
// moved by customer reviews), and inline price edit + pause/resume + remove.
// Price edits show the indicative suggestion for context.
"use client";

import { Leaf, Loader2, Package, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { QtyStepper } from "@/components/common/qty-stepper";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { EmptyState, ErrorState, SkeletonCards } from "@/components/common/states";
import { CARD, CARD_GRID, CropPhoto, PhotoDeleteButton } from "@/components/farmer/crop-photo";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { QualityRing } from "@/components/shop/listing-card";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { cropName } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";
import { formatINR, formatQty, harvestAge, unitName } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  title: string;
  crop: string;
  unit: string;
  price: number;
  suggestedPrice: number | null;
  status: "ACTIVE" | "PAUSED" | "SOLD_OUT";
  total: number;
  available: number;
  reserved: number;
  sold: number;
  imageUrl: string | null;
  harvestDate: string;
  orders: number;
  /** Live score: photos blended with customer reviews. */
  quality: number | null;
  photoScore: number | null;
  grade: string | null;
  reviews: number;
  complaints: number;
}

/** /farmer/listings */
export function FarmerListings() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Row["status"]>("ACTIVE");
  const { data, error, isLoading, mutate } = useSWR<Row[]>("/api/farmer/listings");
  useLive(["inventory.updated", "order.updated", "batch.updated", "notification.created"], () => mutate());
  const [editing, setEditing] = useState<Row | null>(null);
  // `removing` outlives the sheet so its text doesn't vanish while it closes.
  const [removing, setRemoving] = useState<Row | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = data?.filter((r) => r.status === tab) ?? [];
  const tabs: { k: Row["status"]; l: string }[] = [
    { k: "ACTIVE", l: t("status.ACTIVE") },
    { k: "PAUSED", l: t("status.PAUSED") },
    { k: "SOLD_OUT", l: t("status.SOLD_OUT") },
  ];

  async function patch(r: Row, body: { price?: number; status?: "ACTIVE" | "PAUSED" }) {
    setBusy(r.id);
    try {
      await sendJSON(`/api/listings/${r.id}`, body, "PATCH");
      toast.success(
        body.price
          ? t("listings.priceUpdated", { price: formatINR(body.price), unit: unitName(r.unit, lang) })
          : body.status === "PAUSED"
            ? t("listings.pausedToast")
            : t("listings.liveToast"),
      );
      setEditing(null);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function askRemove(r: Row) {
    setRemoving(r);
    setConfirming(true);
  }

  async function remove(r: Row) {
    setConfirming(false);
    setBusy(`remove:${r.id}`);
    try {
      await sendJSON(`/api/listings/${r.id}`, undefined, "DELETE");
      toast.success(t("listings.removedToast"));
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("listings.title")}
        actions={
          <Button asChild variant="brand">
            <Link href="/farmer/batches/new">{t("dash.newHarvest")}</Link>
          </Button>
        }
      />
      <LayoutGroup id="listing-tabs">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((x) => (
            <button key={x.k} type="button" onClick={() => setTab(x.k)} className={cn("relative h-10 rounded-full px-4 text-sm font-medium", tab === x.k ? "text-background" : "border text-muted-foreground")}>
              {tab === x.k && <motion.span layoutId="lt-pill" className="absolute inset-0 -z-10 rounded-full bg-foreground" />}
              {x.l} <span className={cn("ml-1 rounded-full px-1.5 text-xs", tab === x.k ? "bg-background/20" : "bg-muted")}>{data?.filter((r) => r.status === x.k).length ?? 0}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>
      {isLoading && <SkeletonCards count={8} className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data && rows.length === 0 && <EmptyState icon={Package} title={t("common.empty")} />}
      <ul className={CARD_GRID}>
        {rows.map((r, i) => {
          const pct = (n: number) => `${(n / Math.max(1, r.total)) * 100}%`;
          return (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className={CARD}
            >
              <CropPhoto crop={r.crop} src={r.imageUrl}>
                <QualityRing score={r.quality} className="absolute top-2 left-2" />
                <span className="glass absolute bottom-2 left-2 inline-flex h-7 max-w-[calc(100%-1rem)] items-center gap-1 rounded-full px-2.5 text-[11px] font-medium">
                  <Leaf className="size-3 shrink-0" /> <span className="truncate">{harvestAge(r.harvestDate, lang)}</span>
                </span>
                <PhotoDeleteButton label={t("listings.remove")} busy={busy === `remove:${r.id}`} onClick={() => askRemove(r)} />
              </CropPhoto>
              <div className="flex flex-1 flex-col p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="leading-tight font-semibold break-words">{cropName(r.crop, lang)}</p>
                  {r.grade && (
                    <span className={cn("rounded-md px-1.5 text-[11px] font-semibold", r.grade === "A" ? "bg-lime/40" : r.grade === "C" ? "bg-tomato/15 text-tomato" : "bg-muted")}>
                      {t("common.grade", { grade: r.grade })}
                    </span>
                  )}
                </div>
                <p className="tabular mt-1.5 text-lg leading-none font-semibold">
                  {formatINR(r.price)}
                  <span className="text-xs font-normal text-muted-foreground">/{unitName(r.unit, lang)}</span>
                </p>
                {r.suggestedPrice ? <p className="mt-1 text-[11px] text-muted-foreground">{t("listings.suggestedShort", { price: formatINR(r.suggestedPrice) })}</p> : null}
                {r.reviews > 0 && (
                  <p className={cn("mt-1 text-[11px] leading-snug", r.complaints >= 2 ? "font-medium text-tomato" : "text-muted-foreground")}>
                    {t("listings.reviewsLine", { reviews: r.reviews, complaints: r.complaints })}
                    {r.photoScore !== null && <span className="font-normal text-muted-foreground"> · {t("listings.photoStart", { score: r.photoScore })}</span>}
                  </p>
                )}
                <div className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
                  <span className="bg-foreground" style={{ width: pct(r.sold) }} />
                  <span className="bg-foreground/40" style={{ width: pct(r.reserved) }} />
                  <span className="flex-1 bg-muted" />
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  <b className="font-semibold text-foreground">{formatQty(r.available, r.unit, lang)}</b> {t("listings.available")} · {formatQty(r.reserved, r.unit, lang)}{" "}
                  {t("listings.reserved")} · {formatQty(r.sold, r.unit, lang)} {t("listings.sold")}
                </p>
                {r.status !== "SOLD_OUT" && (
                  // flex-1: side by side when they fit, full-width rows on narrow phone cards.
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(r)}>
                      <Pencil /> {t("listings.editPrice")}
                    </Button>
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => patch(r, { status: r.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })} disabled={busy === r.id}>
                      {busy === r.id ? <Loader2 className="animate-spin" /> : r.status === "ACTIVE" ? <Pause /> : <Play />}
                      {r.status === "ACTIVE" ? t("listings.pause") : t("listings.resume")}
                    </Button>
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
      {editing && <PriceEditor row={editing} busy={busy === editing.id} onClose={() => setEditing(null)} onSave={(price) => patch(editing, { price })} />}
      <ResponsiveModal open={confirming} onOpenChange={setConfirming} title={removing ? t("listings.removeTitle", { crop: cropName(removing.crop, lang) }) : ""}>
        <p className="text-sm text-muted-foreground">{t("listings.removeBody")}</p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="min-h-11" onClick={() => setConfirming(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" className="min-h-11" onClick={() => removing && remove(removing)}>
            <Trash2 /> {t("listings.removeConfirm")}
          </Button>
        </div>
      </ResponsiveModal>
    </div>
  );
}

function PriceEditor({ row, busy, onClose, onSave }: { row: Row; busy: boolean; onClose: () => void; onSave: (p: number) => void }) {
  const { t, lang } = useI18n();
  const [price, setPrice] = useState(String(row.price));
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title={`${t("listings.editPrice")} · ${cropName(row.crop, lang)}`}>
      <div className="space-y-4">
        <QtyStepper size="lg" value={price} onChange={setPrice} step={1} min={1} suffix={`/${unitName(row.unit, lang)}`} ariaLabel={t("listings.newPrice")} />
        {row.suggestedPrice && (
          <p className="text-sm text-muted-foreground">
            {t("listings.suggestionWhenListed", { price: formatINR(row.suggestedPrice), unit: unitName(row.unit, lang) })}{" "}
            <button type="button" className="font-semibold underline" onClick={() => setPrice(String(row.suggestedPrice))}>
              {t("listings.useIt")}
            </button>
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("listings.priceNote")}</p>
        <Button size="lg" className="w-full" onClick={() => onSave(Number(price))} disabled={busy || !(Number(price) > 0)}>
          {busy ? <Loader2 className="animate-spin" /> : t("common.save")}
        </Button>
      </div>
    </ResponsiveModal>
  );
}
