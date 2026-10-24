// Simulated payment sheet: shows the honest money flow step by step —
// authorise (hold) → reserve stock → capture — then the result. No real
// money moves; every label says so.
"use client";

import { Check, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { cn } from "@/lib/utils";

export type PayPhase = "authorising" | "reserving" | "done" | "error";

const STEPS: { key: PayPhase; label: string; sub: string }[] = [
  { key: "authorising", label: "Authorising payment", sub: "Amount held on your UPI/card, not taken yet" },
  { key: "reserving", label: "Reserving farm stock", sub: "Locking your quantities so nobody else can buy them" },
  { key: "done", label: "Payment captured", sub: "Charged only for orders whose stock was reserved" },
];

/**
 * @param phase - current step (null = closed)
 * @param amount - total being authorised
 */
export function PaymentSheet({ phase, amount, error, onClose }: { phase: PayPhase | null; amount: string; error?: string | null; onClose: () => void }) {
  const idx = phase === "error" ? -1 : STEPS.findIndex((s) => s.key === phase);
  return (
    <ResponsiveModal open={phase !== null} onOpenChange={(o) => !o && (phase === "error" || phase === "done") && onClose()} title={`Paying ${amount}`} description="Demo payment, no real money moves.">
      <ol className="space-y-4 py-2">
        {STEPS.map((s, i) => {
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
              <div className={cn(state === "todo" && "opacity-50")}>
                <p className="font-medium">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.sub}</p>
              </div>
            </li>
          );
        })}
        {phase === "error" && (
          <li className="flex gap-3 rounded-2xl bg-destructive/10 p-3 text-sm">
            <X className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              {error ?? "Something went wrong."} Your authorisation was released, you haven&apos;t been charged.
            </span>
          </li>
        )}
      </ol>
    </ResponsiveModal>
  );
}
