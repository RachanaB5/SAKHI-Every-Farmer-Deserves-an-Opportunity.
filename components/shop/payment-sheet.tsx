// Payment sheet: shows the honest money flow step by step, then the result.
// Simulated: authorise (hold) → reserve stock → capture; no real money
// moves and every label says so. Razorpay: pay in Razorpay's own window →
// verify the payment and reserve stock → order placed.
"use client";

import { Check, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { cn } from "@/lib/utils";

export type PayPhase = "authorising" | "reserving" | "opening" | "verifying" | "done" | "error";
export type PayMode = "simulated" | "razorpay" | "razorpay-test";

const SIMULATED: { key: PayPhase; label: string; sub: string }[] = [
  { key: "authorising", label: "Authorising payment", sub: "Amount held on your UPI/card, not taken yet" },
  { key: "reserving", label: "Reserving farm stock", sub: "Locking your quantities so nobody else can buy them" },
  { key: "done", label: "Payment captured", sub: "Charged only for orders whose stock was reserved" },
];
const RAZORPAY: { key: PayPhase; label: string; sub: string }[] = [
  { key: "opening", label: "Paying on Razorpay", sub: "UPI, card, netbanking or wallet, in Razorpay's secure window" },
  { key: "verifying", label: "Verifying payment, reserving stock", sub: "We check Razorpay's signature and the amount, then lock your quantities" },
  { key: "done", label: "Order placed", sub: "If a farm ran out meanwhile, its share is refunded through Razorpay" },
];

const DESCRIPTION: Record<PayMode, string> = {
  simulated: "Demo payment, no real money moves.",
  "razorpay-test": "Razorpay test mode, no real money moves.",
  razorpay: "Paid securely through Razorpay.",
};

/**
 * @param phase - current step (null = closed)
 * @param amount - total being paid
 * @param mode - simulated payment or Razorpay (test or live keys)
 * @param paymentRef - Razorpay payment id, shown with an error once money may have moved
 */
export function PaymentSheet({
  phase,
  amount,
  error,
  onClose,
  mode = "simulated",
  paymentRef,
}: {
  phase: PayPhase | null;
  amount: string;
  error?: string | null;
  onClose: () => void;
  mode?: PayMode;
  paymentRef?: string | null;
}) {
  const steps = mode === "simulated" ? SIMULATED : RAZORPAY;
  const idx = phase === "error" ? -1 : steps.findIndex((s) => s.key === phase);
  return (
    <ResponsiveModal open={phase !== null} onOpenChange={(o) => !o && (phase === "error" || phase === "done") && onClose()} title={`Paying ${amount}`} description={DESCRIPTION[mode]}>
      <ol className="space-y-4 py-2">
        {steps.map((s, i) => {
          const state = phase === "error" ? (i === 0 ? "done" : "todo") : i < idx || phase === "done" ? "done" : i === idx ? "active" : "todo";
          return (
            <li key={s.key} className="flex gap-3">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border-2 transition-colors",
                  state === "done" && "border-lime bg-lime text-lime-foreground",
                  state === "active" && "border-foreground",
                  state === "todo" && "border-border text-muted-foreground",
                )}
              >
                <AnimatePresence mode="wait">
                  {state === "done" ? (
                    <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Check className="size-4" strokeWidth={3} />
                    </motion.span>
                  ) : state === "active" ? (
                    <Loader2 key="a" className="size-4 animate-spin" />
                  ) : (
                    <span key="t" className="text-xs font-semibold">
                      {i + 1}
                    </span>
                  )}
                </AnimatePresence>
              </span>
              <div className={cn("min-w-0", state === "todo" && "opacity-50")}>
                <p className="font-medium">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.sub}</p>
              </div>
            </li>
          );
        })}
        {phase === "error" && (
          <li className="flex gap-3 rounded-2xl bg-destructive/10 p-3 text-sm">
            <X className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="min-w-0 break-words">
              {error ?? "Something went wrong."}{" "}
              {mode === "simulated"
                ? "Your authorisation was released, you haven't been charged."
                : paymentRef
                  ? `Razorpay payment ${paymentRef}. If your orders don't appear under My orders shortly, keep this reference to trace the payment.`
                  : "Nothing was charged."}
            </span>
          </li>
        )}
      </ol>
    </ResponsiveModal>
  );
}
