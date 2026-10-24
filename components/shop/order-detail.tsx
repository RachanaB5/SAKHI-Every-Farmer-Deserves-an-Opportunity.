// Buyer order tracking: animated status, live timeline (SSE + polling
// fallback), handover panel (OTP / pickup QR), bill, honest payment
// trail, farmer & rider contacts, cancellation and post-delivery feedback.
"use client";

import { ArrowLeft, Phone, Radio } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { MediaImage } from "@/components/common/media-image";
import { ErrorState, SkeletonBlock } from "@/components/common/states";
import { OrderTimeline, PaymentTrail, StatusHero } from "@/components/orders/order-tracker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLive } from "@/hooks/use-live";
import { sendJSON } from "@/lib/fetcher";
import { formatINR, formatQty } from "@/lib/format";
import type { SerializedOrder } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

const CANCEL_REASONS = ["Ordered by mistake", "Need it at a different time", "Found it elsewhere"];

/**
 * @param backHref - list to return to
 * @param handover - optional OTP/QR panel (rendered when the order is with a rider or ready for pickup)
 * @param after - optional block shown after delivery (feedback)
 * @param actions - optional header buttons (e.g. invoice)
 */
export function OrderDetail({
  id,
  backHref = "/shop/orders",
  handover,
  after,
  actions,
}: {
  id: string;
  backHref?: string;
  handover?: (order: SerializedOrder, refresh: () => void) => React.ReactNode;
  after?: (order: SerializedOrder, refresh: () => void) => React.ReactNode;
  actions?: (order: SerializedOrder) => React.ReactNode;
}) {
  const { data: order, error, isLoading, mutate } = useSWR<SerializedOrder>(`/api/orders/${id}`);
  const [live, setLive] = useState(false);
  useLive(["order.updated", "delivery.updated"], (e) => {
    if (e.type !== "poll") setLive(true);
    mutate();
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [busy, setBusy] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-36 w-full rounded-3xl" />
        <SkeletonBlock className="h-72 w-full rounded-3xl" />
      </div>
    );
  }
  if (error || !order) return <ErrorState message={error?.message} onRetry={() => mutate()} />;

  const canCancel = ["PLACED", "CONFIRMED"].includes(order.status);
  async function cancel() {
    setBusy(true);
    try {
      await sendJSON(`/api/orders/${id}/cancel`, { reason });
      toast.success("Order cancelled, refund issued");
      setCancelOpen(false);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={backHref} className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Orders
        </Link>
        <span className="flex items-center gap-2">
          {actions?.(order)}
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", live ? "border-lime/60 text-foreground" : "text-muted-foreground")}>
            <Radio className={cn("size-3.5", live && "text-lime")} /> {live ? "Live" : "Auto-updating"}
          </span>
        </span>
      </div>

      <StatusHero order={order} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          {handover?.(order, () => mutate())}
          <section className="rounded-3xl border bg-card p-5">
            <p className="mb-4 font-semibold">Progress</p>
            <OrderTimeline order={order} />
          </section>
          {after?.(order, () => mutate())}
        </div>

        <div className="space-y-5">
          <section className="rounded-3xl border bg-card p-5">
            <p className="font-semibold">Items</p>
            <ul className="mt-3 space-y-3">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">{it.imageUrl && <MediaImage src={it.imageUrl} sizes="48px" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium break-words">{it.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatQty(it.qty, it.unit)} × {formatINR(it.unitPrice)}
                    </span>
                  </span>
                  <span className="tabular text-sm font-medium">{formatINR(it.qty * it.unitPrice)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Items</dt>
                <dd className="tabular">{formatINR(order.subtotal, true)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{order.fulfilment === "PICKUP" ? "Self-pickup" : "Delivery"}</dt>
                <dd className="tabular">{order.deliveryFee ? formatINR(order.deliveryFee, true) : "Free"}</dd>
              </div>
              <div className="flex justify-between pt-1 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatINR(order.total, true)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl border bg-card p-5">
            <p className="mb-3 font-semibold">Payment</p>
            <PaymentTrail order={order} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Contact label="Farmer" name={order.farmer.farmName ?? order.farmer.name} sub={order.farmer.village ?? ""} phone={order.farmer.phone} />
            {order.delivery?.worker && <Contact label="Rider" name={order.delivery.worker.name} sub={order.delivery.status.replace(/_/g, " ").toLowerCase()} phone={order.delivery.worker.phone} />}
          </section>

          {canCancel && (
            <Button variant="outline" className="w-full" onClick={() => setCancelOpen(true)}>
              Cancel order
            </Button>
          )}
        </div>
      </div>

      <ResponsiveModal open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel this order?" description="Your payment is refunded and the farmer's stock is released.">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CANCEL_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-full border px-3 py-1.5 text-sm", reason === r && "border-foreground bg-muted")}>
                {r}
              </button>
            ))}
          </div>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="destructive" size="lg" className="w-full" onClick={cancel} disabled={busy || reason.trim().length < 3}>
            Cancel order
          </Button>
        </div>
      </ResponsiveModal>
    </div>
  );
}

function Contact({ label, name, sub, phone }: { label: string; name: string; sub: string; phone: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium break-words">{name}</p>
        <p className="text-xs text-muted-foreground capitalize">{sub}</p>
      </div>
      {phone && (
        <Button asChild variant="outline" size="icon" aria-label={`Call ${name}`}>
          <a href={`tel:${phone.replace(/\s/g, "")}`}>
            <Phone className="size-4" />
          </a>
        </Button>
      )}
    </div>
  );
}
