// Farmer "My listings": live / paused / sold-out tabs with stock split
// (sold · reserved · available), visual score, and inline price edit +
// pause/resume. Price edits show the indicative suggestion for context.
"use client";

import { Loader2, Package, Pause, Pencil, Play } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { QtyStepper } from "@/components/common/qty-stepper";
import { MediaImage } from "@/components/common/media-image";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { FarmerStatusBadge } from "@/components/farmer/farmer-status-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
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
  quality: number | null;
  grade: string | null;
}

/** /farmer/listings */
export function FarmerListings() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Row["status"]>("ACTIVE");
  const { data, error, isLoading, mutate } = useSWR<Row[]>("/api/farmer/listings");
  useLive(["inventory.updated", "order.updated", "batch.updated"], () => mutate());
  const [editing, setEditing] = useState<Row | null>(null);
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
      {isLoading && <SkeletonRows count={4} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data && rows.length === 0 && <EmptyState icon={Package} title={t("common.empty")} />}
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((r, i) => {
          const pct = (n: number) => `${(n / Math.max(1, r.total)) * 100}%`;
          return (
            <motion.li key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} className="flex gap-3 rounded-3xl border bg-card p-3 sm:p-4">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted">{r.imageUrl && <MediaImage src={r.imageUrl} sizes="80px" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{cropName(r.crop, lang)}</p>
                  <FarmerStatusBadge status={r.status} />
                  {r.quality !== null && <span className="text-xs text-muted-foreground">{t("listings.visual", { score: r.quality })}</span>}
                </div>
                <p className="mt-0.5 text-sm">
                  <b className="tabular">{formatINR(r.price)}</b>/{unitName(r.unit, lang)}
                  {r.suggestedPrice ? <span className="text-xs text-muted-foreground"> · {t("listings.suggestedShort", { price: formatINR(r.suggestedPrice) })}</span> : null}
                </p>
                <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
                  <span className="bg-foreground" style={{ width: pct(r.sold) }} />
                  <span className="bg-foreground/40" style={{ width: pct(r.reserved) }} />
                  <span className="flex-1 bg-muted" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatQty(r.available, r.unit, lang)} {t("listings.available")} · {formatQty(r.reserved, r.unit, lang)} {t("listings.reserved")} ·{" "}
                  {formatQty(r.sold, r.unit, lang)} {t("listings.sold")} · {harvestAge(r.harvestDate, lang)}
                </p>
                {r.status !== "SOLD_OUT" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      <Pencil /> {t("listings.editPrice")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => patch(r, { status: r.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })} disabled={busy === r.id}>
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
