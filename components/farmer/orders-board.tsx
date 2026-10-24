// Farmer orders board: To pack / In transit / Done tabs, each order with
// buyer, slot, items, the farmer's estimated net, and one-tap actions —
// mark packed, book a rider (one click), ready for pickup, verify pickup.
"use client";

import { Bike, ClipboardList, Loader2, MapPin, Package, ScanLine, Store, Timer } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { FarmerStatusBadge, statusText } from "@/components/farmer/farmer-status-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { cropName } from "@/lib/crops";
import { settlementFor } from "@/lib/fees";
import { sendJSON } from "@/lib/fetcher";
import { formatINR, formatQty, timeAgo } from "@/lib/format";
import type { SerializedOrder } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "pack", labelKey: "orders.colPack", statuses: ["PLACED", "CONFIRMED"] },
  { key: "moving", labelKey: "orders.colMoving", statuses: ["PACKED", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"] },
  { key: "done", labelKey: "orders.colDone", statuses: ["DELIVERED", "COLLECTED", "CANCELLED", "DISPUTED"] },
] as const;

/** What the farmer keeps: same formula as the real settlement (commission + capped courier share). */
export function farmerNet(o: SerializedOrder): { net: number; final: boolean } {
  if (o.settlement) return { net: o.settlement.net, final: true };
  const est = settlementFor({ subtotal: o.subtotal, platformFee: o.platformFee, buyerDeliveryFee: o.deliveryFee, actualCourierCost: o.delivery?.cost ?? 0 });
  return { net: est.net, final: false };
}

/** Commission % actually charged on this order (frozen at checkout). */
function commissionOf(o: SerializedOrder): number {
  return o.subtotal > 0 ? Math.round((o.platformFee / o.subtotal) * 1000) / 10 : 0;
}

/** The /farmer/orders board. */
export function OrdersBoard() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pack");
  const { data, error, isLoading, mutate } = useSWR<SerializedOrder[]>("/api/orders?limit=100");
  useLive(["order.updated", "delivery.updated"], () => mutate());
  const [busy, setBusy] = useState<string | null>(null);

  const current = TABS.find((x) => x.key === tab)!;
  const rows = data?.filter((o) => (current.statuses as readonly string[]).includes(o.status)) ?? [];
  const count = (key: string) => data?.filter((o) => (TABS.find((x) => x.key === key)!.statuses as readonly string[]).includes(o.status)).length ?? 0;

  async function act(o: SerializedOrder, action: "PACK" | "BOOK_DELIVERY" | "READY_FOR_PICKUP") {
    setBusy(`${o.id}:${action}`);
    try {
      const res = await sendJSON<{ worker?: { name: string } }>(`/api/orders/${o.id}/advance`, { action });
      toast.success(
        action === "BOOK_DELIVERY"
          ? t("orders.riderOnWay", { name: res.worker?.name ?? "" })
          : action === "PACK"
            ? t("orders.packedToast")
            : t("orders.buyerNotified"),
      );
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title={t("orders.title")} description={t("orders.desc")} />
      <LayoutGroup id="farmer-orders-tabs">
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((x) => (
            <button key={x.key} type="button" onClick={() => setTab(x.key)} className={cn("relative h-11 rounded-full px-4 text-sm font-medium", tab === x.key ? "text-background" : "border text-muted-foreground")}>
              {tab === x.key && <motion.span layoutId="fo-pill" className="absolute inset-0 -z-10 rounded-full bg-foreground" />}
              {t(x.labelKey)}
              {count(x.key) > 0 && <span className={cn("ml-1.5 rounded-full px-1.5 text-xs", tab === x.key ? "bg-background/20" : "bg-muted")}>{count(x.key)}</span>}
            </button>
          ))}
        </div>
      </LayoutGroup>

      {isLoading && <SkeletonRows count={4} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data && rows.length === 0 && <EmptyState icon={ClipboardList} title={tab === "pack" ? t("orders.nothingToPack") : t("common.empty")} />}

      <ul className="space-y-3">
        {rows.map((o, i) => {
          const { net, final } = farmerNet(o);
          const isBusy = (a: string) => busy === `${o.id}:${a}`;
          return (
            <motion.li key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} className="rounded-3xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">{o.code}</p>
                  <p className="text-sm break-words">
                    {o.buyer.name} <span className="text-muted-foreground">· {o.area}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs">
                    {o.fulfilment === "PICKUP" ? <Store className="size-3" /> : <Bike className="size-3" />}
                    {o.fulfilment === "PICKUP" ? t("orders.pickup") : t("orders.delivery")}
                  </span>
                  <FarmerStatusBadge status={o.status} pulse={["CONFIRMED", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"].includes(o.status)} />
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {o.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span className="break-words">
                      <Package className="mr-1.5 inline size-3.5 text-muted-foreground" />
                      {it.crop ? cropName(it.crop, lang) : it.title} · <b>{formatQty(it.qty, it.unit, lang)}</b>
                    </span>
                    <span className="tabular text-muted-foreground">{formatINR(it.qty * it.unitPrice)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {o.slot && (
                  <span className="inline-flex items-center gap-1">
                    <Timer className="size-3.5" /> {o.slot}
                  </span>
                )}
                {o.fulfilment === "DELIVERY" && o.addressLine && (
                  <span className="inline-flex items-center gap-1 break-words">
                    <MapPin className="size-3.5" /> {o.addressLine}
                  </span>
                )}
                <span>{timeAgo(o.createdAt, lang)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {final ? t("orders.yourPayout") : t("orders.estPayout")}
                  <span className="block text-[11px]">{t(o.delivery?.cost ? "orders.afterFeeDelivery" : "orders.afterFee", { pct: commissionOf(o) })}</span>
                </span>
                <span className="tabular text-lg font-semibold">{formatINR(net, true)}</span>
              </div>
              {o.delivery?.worker && o.fulfilment === "DELIVERY" && (
                <p className="mt-2 text-sm">
                  <Bike className="mr-1 inline size-4" /> {t("orders.rider")} <b>{o.delivery.worker.name}</b>
                  {o.delivery.distanceKm ? ` · ${t("orders.kmRun", { km: Math.round(o.delivery.distanceKm) })}` : ""} · {statusText(t, o.delivery.status)}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {o.status === "CONFIRMED" && (
                  <Button variant="outline" onClick={() => act(o, "PACK")} disabled={busy !== null}>
                    {isBusy("PACK") ? <Loader2 className="animate-spin" /> : <Package />} {t("orders.markPacked")}
                  </Button>
                )}
                {o.fulfilment === "DELIVERY" && ["CONFIRMED", "PACKED"].includes(o.status) && !o.delivery?.worker && (
                  <Button variant="brand" onClick={() => act(o, "BOOK_DELIVERY")} disabled={busy !== null}>
                    {isBusy("BOOK_DELIVERY") ? <Loader2 className="animate-spin" /> : <Bike />} {t("orders.bookDelivery")}
                  </Button>
                )}
                {o.fulfilment === "PICKUP" && ["CONFIRMED", "PACKED"].includes(o.status) && (
                  <Button variant="brand" onClick={() => act(o, "READY_FOR_PICKUP")} disabled={busy !== null}>
                    {isBusy("READY_FOR_PICKUP") ? <Loader2 className="animate-spin" /> : <Store />} {t("orders.readyPickup")}
                  </Button>
                )}
                {o.status === "READY_FOR_PICKUP" && (
                  <Button asChild variant="brand">
                    <Link href={`/farmer/pickup?code=${o.code}`}>
                      <ScanLine /> {t("nav.pickup")}
                    </Link>
                  </Button>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
