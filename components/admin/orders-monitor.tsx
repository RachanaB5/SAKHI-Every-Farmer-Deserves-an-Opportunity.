// Admin order monitoring: filter by state / channel / text, responsive
// table (stacked cards on phones), and an order sheet with timeline,
// payment trail, buyer feedback (photo) and dispute resolution.
"use client";

import { Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ReviewImages } from "@/components/common/review-images";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { OrderTimeline, PaymentTrail } from "@/components/orders/order-tracker";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLive } from "@/hooks/use-live";
import { sendJSON } from "@/lib/fetcher";
import { formatINR, formatQty, timeAgo } from "@/lib/format";
import { localizeTitle } from "@/lib/i18n/titles";
import type { SerializedOrder } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

const FILTERS = [
  { k: "active", l: "In progress", q: "scope=active" },
  { k: "DISPUTED", l: "Disputed", q: "status=DISPUTED" },
  { k: "CANCELLED", l: "Cancelled", q: "status=CANCELLED" },
  { k: "DELIVERED", l: "Delivered", q: "status=DELIVERED" },
  { k: "all", l: "All", q: "scope=all" },
];

const ISSUE_LABEL: Record<string, string> = { NOT_FRESH: "Not fresh", DAMAGED: "Damaged", SHORT_QTY: "Less than ordered", WRONG_ITEM: "Wrong item", LATE: "Late" };

/** /admin/orders */
export function OrdersMonitor() {
  const { tx, lang } = useI18n();
  const params = useSearchParams();
  const [filter, setFilter] = useState(params.get("status") === "DISPUTED" ? "DISPUTED" : "active");
  const [type, setType] = useState<"" | "RETAIL" | "BULK">("");
  const [q, setQ] = useState(params.get("q") ?? "");
  const query = useDeferredValue(q.trim());
  const f = FILTERS.find((x) => x.k === filter)!;
  const key = `/api/orders?${f.q}&limit=150${type ? `&type=${type}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<SerializedOrder[]>(key, { keepPreviousData: true });
  useLive(["order.updated"], () => mutate());
  const [open, setOpen] = useState<SerializedOrder | null>(null);

  return (
    <div>
      <PageHeader title="Order *monitor*" description="Every order across the pilot. Resolve disputes and issue refunds here." />
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx("Order code, buyer or farmer")} className="pl-10" aria-label={tx("Search orders")} />
        </label>
        <div className="grid grid-cols-3 gap-1 rounded-xl border p-1 sm:w-72">
          {(["", "RETAIL", "BULK"] as const).map((t) => (
            <button key={t || "any"} type="button" onClick={() => setType(t)} className={cn("min-h-9 rounded-lg text-sm", type === t ? "bg-foreground text-background" : "text-muted-foreground")}>
              {tx(t === "" ? "Any" : t === "RETAIL" ? "Retail" : "Bulk")}
            </button>
          ))}
        </div>
      </div>
      <LayoutGroup id="admin-order-filter">
        <div className="mt-3 mb-4 flex flex-wrap gap-2">
          {FILTERS.map((x) => (
            <button key={x.k} type="button" onClick={() => setFilter(x.k)} className={cn("relative h-10 rounded-full px-4 text-sm font-medium", filter === x.k ? "text-background" : "border text-muted-foreground")}>
              {filter === x.k && <motion.span layoutId="aof-pill" className="absolute inset-0 -z-10 rounded-full bg-foreground" />}
              {tx(x.l)}
            </button>
          ))}
        </div>
      </LayoutGroup>

      {isLoading && !data && <SkeletonRows count={6} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data?.length === 0 && <EmptyState icon={ShieldCheck} title="No orders match" />}

      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-3xl border bg-card">
          <div className="hidden grid-cols-[110px_1.2fr_1.2fr_90px_110px_140px] gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
            <span>{tx("Order")}</span>
            <span>{tx("Buyer")}</span>
            <span>{tx("Farmer")}</span>
            <span>{tx("Area")}</span>
            <span className="text-right">{tx("Total")}</span>
            <span>{tx("Status")}</span>
          </div>
          <ul className="divide-y">
            {data.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setOpen(o)} className="grid w-full gap-1 px-4 py-3 text-left text-sm hover:bg-muted/40 md:grid-cols-[110px_1.2fr_1.2fr_90px_110px_140px] md:items-center md:gap-3">
                  <span className="flex items-center justify-between md:block">
                    <span className="font-mono font-semibold">{o.code}</span>
                    <span className="text-xs text-muted-foreground md:block">{timeAgo(o.createdAt, lang)}</span>
                  </span>
                  <span className="break-words">
                    <span className="text-xs text-muted-foreground md:hidden">{tx("Buyer")} · </span>
                    {o.buyer.name} {o.type === "BULK" && <span className="ml-1 rounded bg-muted px-1 text-[10px]">{tx("BULK")}</span>}
                  </span>
                  <span className="break-words">
                    <span className="text-xs text-muted-foreground md:hidden">{tx("Farmer")} · </span>
                    {o.farmer.name}
                  </span>
                  <span className="text-muted-foreground">{tx(o.area)}</span>
                  <span className="tabular font-medium md:text-right">{formatINR(o.total)}</span>
                  <span>
                    <StatusBadge status={o.status} pulse={o.status === "DISPUTED"} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && <OrderSheet orderId={open.id} onClose={() => setOpen(null)} onChanged={() => mutate()} />}
    </div>
  );
}

function OrderSheet({ orderId, onClose, onChanged }: { orderId: string; onClose: () => void; onChanged: () => void }) {
  const { tx, lang } = useI18n();
  const { data: o, mutate } = useSWR<SerializedOrder>(`/api/orders/${orderId}`);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function resolve(action: "REFUND" | "DISMISS") {
    setBusy(action);
    try {
      const r = await sendJSON<{ recoveryNeeded: boolean }>(`/api/admin/orders/${orderId}/resolve`, { action, note });
      toast.success(tx(action === "REFUND" ? (r.recoveryNeeded ? "Refunded, farmer was already paid, flagged for recovery" : "Refunded, pending payout reversed") : "Dispute closed"));
      mutate();
      onChanged();
    } catch (e) {
      toast.error(tx((e as Error).message));
    } finally {
      setBusy(null);
    }
  }
  async function cancel() {
    setBusy("CANCEL");
    try {
      await sendJSON(`/api/orders/${orderId}/cancel`, { reason: note || "Cancelled by FoodFlow support" });
      toast.success(tx("Cancelled, stock released, buyer refunded"));
      mutate();
      onChanged();
    } catch (e) {
      toast.error(tx((e as Error).message));
    } finally {
      setBusy(null);
    }
  }
  return (
    <ResponsiveModal open onOpenChange={(v) => !v && onClose()} title={o ? `${o.code} · ${o.buyer.name}` : tx("Order")} className="sm:max-w-2xl">
      {!o ? (
        <Loader2 className="mx-auto size-6 animate-spin" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={o.status} />
            <span className="text-muted-foreground">
              {tx(o.type === "BULK" ? "Bulk" : "Retail")} · {tx(o.fulfilment === "PICKUP" ? "Self-pickup" : "Delivery")} · {tx(o.area)} · {tx("farmer {name}", { name: o.farmer.name })}
            </span>
          </div>
          <ul className="space-y-1 rounded-2xl bg-muted/40 p-3 text-sm">
            {o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span>
                  {localizeTitle(i.title, lang)} × {formatQty(i.qty, i.unit, lang)}
                </span>
                <span className="tabular">{formatINR(i.qty * i.unitPrice)}</span>
              </li>
            ))}
            <li className="flex justify-between border-t pt-1 font-semibold">
              <span>{tx("Total")}</span>
              <span className="tabular">{formatINR(o.total, true)}</span>
            </li>
          </ul>
          <div>
            <p className="mb-2 text-sm font-semibold">{tx("Payment")}</p>
            <PaymentTrail order={o} />
            {o.settlement && (
              <p className="mt-2 text-xs text-muted-foreground">
                {tx("Farmer payout {amount}", { amount: formatINR(o.settlement.net, true) })} · {tx(o.settlement.status === "SETTLED" ? "Settled" : "Pending")}
              </p>
            )}
          </div>
          {o.feedback && (
            <div className="rounded-2xl border p-3 text-sm">
              <p className="font-semibold">
                {tx("Buyer feedback")} · {o.feedback.rating}★ {o.feedback.issue && o.feedback.issue !== "NONE" ? `· ${tx(ISSUE_LABEL[o.feedback.issue] ?? o.feedback.issue.replace(/_/g, " ").toLowerCase())}` : ""}
              </p>
              {o.feedback.comment && <p className="mt-1 text-muted-foreground">“{o.feedback.comment}”</p>}
              <ReviewImages images={o.feedback.photoUrls} label={tx("Review image")} />
            </div>
          )}
          <div>
            <p className="mb-3 text-sm font-semibold">{tx("Timeline")}</p>
            <OrderTimeline order={o} />
          </div>
          {(o.status === "DISPUTED" || ["PLACED", "CONFIRMED", "PACKED", "READY_FOR_PICKUP"].includes(o.status)) && (
            <div className="space-y-2 rounded-2xl border p-3">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("Note (saved to the audit log)")} />
              <div className="flex flex-wrap gap-2">
                {o.status === "DISPUTED" ? (
                  <>
                    <Button variant="destructive" onClick={() => resolve("REFUND")} disabled={busy !== null || note.trim().length < 3}>
                      {busy === "REFUND" ? <Loader2 className="animate-spin" /> : <RotateCcw />} {tx("Refund {amount}", { amount: formatINR(o.total) })}
                    </Button>
                    <Button variant="outline" onClick={() => resolve("DISMISS")} disabled={busy !== null || note.trim().length < 3}>
                      {tx("Close without refund")}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={cancel} disabled={busy !== null}>
                    {busy === "CANCEL" && <Loader2 className="animate-spin" />} {tx("Cancel & refund")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}
