// Live order progress: an animated status hero (rider riding along a road
// while out for delivery, a bouncing parcel while packed…) and a vertical
// timeline whose line fills as steps complete. Shared by buyer and farmer.
"use client";

import { Bike, Check, CircleX, PackageCheck, ShoppingBag, Store, ThumbsUp } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { formatDateTime } from "@/lib/format";
import type { SerializedOrder } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

const DELIVERY_FLOW = ["PLACED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
const PICKUP_FLOW = ["PLACED", "CONFIRMED", "PACKED", "READY_FOR_PICKUP", "COLLECTED"] as const;

const LABEL: Record<string, { title: string; sub: string }> = {
  PLACED: { title: "Order placed", sub: "Payment authorised" },
  CONFIRMED: { title: "Confirmed", sub: "Stock reserved at the farm" },
  PACKED: { title: "Packed", sub: "Farmer has packed your order" },
  OUT_FOR_DELIVERY: { title: "Out for delivery", sub: "Rider is on the way" },
  READY_FOR_PICKUP: { title: "Ready for pickup", sub: "Show your QR or OTP at the farm" },
  DELIVERED: { title: "Delivered", sub: "Handover verified with OTP" },
  COLLECTED: { title: "Collected", sub: "Pickup verified" },
};

/** Index of the furthest completed step in the flow. */
function progressIndex(order: SerializedOrder) {
  const flow: readonly string[] = order.fulfilment === "PICKUP" ? PICKUP_FLOW : DELIVERY_FLOW;
  if (order.status === "DISPUTED") return flow.length - 1;
  const seen = order.events.map((e) => e.status);
  let idx = flow.indexOf(order.status);
  if (idx === -1) idx = Math.max(...seen.map((s) => flow.indexOf(s)), 0);
  return idx;
}

/** Big animated status block. */
export function StatusHero({ order }: { order: SerializedOrder }) {
  const reduce = useReducedMotion();
  const s = order.status;
  const title = s === "CANCELLED" ? "Cancelled" : s === "DISPUTED" ? "Under review" : LABEL[s]?.title ?? s;
  const sub =
    s === "CANCELLED"
      ? order.cancelReason ?? "This order was cancelled"
      : s === "DISPUTED"
        ? "We're looking into the issue you reported"
        : s === "OUT_FOR_DELIVERY"
          ? `${order.delivery?.worker?.name ?? "Your rider"} is on the way${order.slot ? ` · ${order.slot}` : ""}`
          : s === "CONFIRMED" || s === "PLACED"
            ? `${order.farmer.name} will pack it soon${order.slot ? ` · ${order.slot}` : ""}`
            : LABEL[s]?.sub ?? "";
  return (
    <div className={cn("dark relative overflow-hidden rounded-3xl bg-background p-5 text-foreground sm:p-6", s === "CANCELLED" && "bg-[oklch(0.2_0.02_20)]")}>
      <span className="absolute -top-16 -right-10 size-56 animate-orb rounded-full bg-lime/20 blur-3xl" />
      <div className="relative flex items-center gap-4">
        <div className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-lime text-lime-foreground">
          {s === "OUT_FOR_DELIVERY" ? (
            <Bike className="size-7" />
          ) : s === "PACKED" || s === "READY_FOR_PICKUP" ? (
            <motion.span animate={reduce ? undefined : { y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
              {s === "PACKED" ? <PackageCheck className="size-7" /> : <Store className="size-7" />}
            </motion.span>
          ) : s === "DELIVERED" || s === "COLLECTED" ? (
            <ThumbsUp className="size-7" />
          ) : s === "CANCELLED" ? (
            <CircleX className="size-7" />
          ) : (
            <ShoppingBag className="size-7" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{order.code}</p>
          <p className="text-2xl leading-tight font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </div>
      </div>
      {s === "OUT_FOR_DELIVERY" && (
        <div className="relative mt-5 h-8" aria-hidden>
          <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-white/20" />
          <motion.span
            className="absolute top-0 grid size-8 place-items-center rounded-full bg-lime text-lime-foreground"
            animate={reduce ? undefined : { left: ["0%", "calc(100% - 2rem)"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
          >
            <Bike className="size-4" />
          </motion.span>
          <span className="absolute top-1/2 right-0 size-3 -translate-y-1/2 rounded-full bg-tomato" />
        </div>
      )}
    </div>
  );
}

/** Vertical step timeline with timestamps. */
export function OrderTimeline({ order }: { order: SerializedOrder }) {
  const flow: readonly string[] = order.fulfilment === "PICKUP" ? PICKUP_FLOW : DELIVERY_FLOW;
  const idx = progressIndex(order);
  const cancelled = order.status === "CANCELLED";
  const when = (s: string) => order.events.find((e) => e.status === s)?.createdAt;
  return (
    <ol className="relative">
      {flow.map((step, i) => {
        const done = !cancelled && i <= idx;
        const current = !cancelled && i === idx && !["DELIVERED", "COLLECTED"].includes(order.status);
        const t = when(step);
        return (
          <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
            {i < flow.length - 1 && (
              <span className="absolute top-8 bottom-0 left-[15px] w-0.5 bg-border">
                <motion.span
                  className="absolute inset-x-0 top-0 bg-lime"
                  initial={{ height: 0 }}
                  animate={{ height: !cancelled && i < idx ? "100%" : "0%" }}
                  transition={{ duration: 0.6, delay: i * 0.12 }}
                />
              </span>
            )}
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 bg-background transition-colors",
                done ? "border-lime bg-lime text-lime-foreground" : "border-border text-muted-foreground",
              )}
            >
              {current && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-lime/60" />}
              {done ? <Check className="relative size-4" strokeWidth={3} /> : <span className="text-xs">{i + 1}</span>}
            </span>
            <div className={cn("pt-1", !done && "opacity-50")}>
              <p className="leading-tight font-medium">{LABEL[step].title}</p>
              <p className="text-sm text-muted-foreground">{t ? formatDateTime(t) : LABEL[step].sub}</p>
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="mt-2 flex gap-3 rounded-2xl bg-destructive/10 p-3 text-sm">
          <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" /> {order.cancelReason ?? "Cancelled"}
        </li>
      )}
    </ol>
  );
}

/** Honest payment trail: authorised → captured (→ refunded), or paid on Razorpay (→ refunded through it). */
export function PaymentTrail({ order }: { order: SerializedOrder }) {
  const p = order.payment;
  if (!p) return null;
  const gateway = p.provider === "RAZORPAY";
  const steps = [
    ...(gateway
      ? [{ k: "Paid on Razorpay", at: p.authorisedAt, on: true }]
      : [
          { k: "Authorised", at: p.authorisedAt, on: true },
          { k: "Captured", at: p.capturedAt, on: Boolean(p.capturedAt) },
        ]),
    ...(p.refundedAt ? [{ k: "Refunded", at: p.refundedAt, on: true }] : []),
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <span key={s.k} className="flex items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", s.on ? (s.k === "Refunded" ? "bg-muted" : "bg-lime/35") : "bg-muted text-muted-foreground")}>
              {s.k}
              {s.at ? ` · ${formatDateTime(s.at)}` : ""}
            </span>
            {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs break-words text-muted-foreground">
        {p.status === "FAILED"
          ? p.failureReason ?? "Authorisation released, you weren't charged."
          : p.status === "REFUNDED"
            ? gateway
              ? `Refunded through Razorpay${p.refundRef ? `, refund ref ${p.refundRef}` : ""}. Banks usually take 5 to 7 working days to show it.`
              : "Refunded to your original payment method (simulated)."
            : gateway && p.failureReason
              ? `${p.failureReason}. Payment ref ${p.ref}.`
              : p.status === "CAPTURED" || gateway
                ? `${p.method}, ref ${p.ref}. The farmer is paid only after the handover is verified.`
                : "Held on your account, not yet charged."}
      </p>
    </div>
  );
}
