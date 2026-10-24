// Approve / request changes / reject modal for the admin review queue.
// Reject and resubmit require a note (quick-pick reasons provided).
"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type DecisionKind = "APPROVE" | "REJECT" | "RESUBMIT";

const QUICK: Record<Exclude<DecisionKind, "APPROVE">, string[]> = {
  RESUBMIT: ["Photo too dark, retake in daylight", "Show the whole lot, not just a close-up", "Quantity looks different from the photos", "Price is far above the market range"],
  REJECT: ["Photo re-used from another listing", "Photos don't show the declared crop", "Visible rot or mould", "Harvest date doesn't match the photos"],
};

const COPY: Record<DecisionKind, { title: string; cta: string; variant: "brand" | "outline" | "destructive" }> = {
  APPROVE: { title: "Approve and publish", cta: "Approve & go live", variant: "brand" },
  RESUBMIT: { title: "Request changes", cta: "Send back to farmer", variant: "outline" },
  REJECT: { title: "Reject harvest", cta: "Reject", variant: "destructive" },
};

/**
 * @param kind - which decision is being confirmed (null = closed)
 * @param defaults - proposed price/grade prefilled for approvals
 * @param onConfirm - performs the API call; dialog shows a spinner until it settles
 */
export function DecisionDialog({
  kind,
  onClose,
  defaults,
  onConfirm,
}: {
  kind: DecisionKind | null;
  onClose: () => void;
  defaults: { price: number | null; grade: string | null; unit: string };
  onConfirm: (input: { note?: string; price?: number; grade?: "A" | "B" | "C" }) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(String(defaults.price ?? ""));
  const [grade, setGrade] = useState(defaults.grade ?? "B");
  const [busy, setBusy] = useState(false);
  if (!kind) return null;
  const copy = COPY[kind];
  const needsNote = kind !== "APPROVE";

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm({
        note: note.trim() || undefined,
        ...(kind === "APPROVE" ? { price: Number(price) || undefined, grade: grade as "A" | "B" | "C" } : {}),
      });
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveModal open={Boolean(kind)} onOpenChange={(o) => !o && onClose()} title={copy.title}>
      <div className="space-y-4">
        {kind === "APPROVE" && (
          <>
            <p className="text-sm text-muted-foreground">
              This creates a live listing buyers can order from. AI flags are advisory, you&apos;re making the call.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ap-price">Price (₹/{defaults.unit})</Label>
                <Input id="ap-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <Label>Grade</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {["A", "B", "C"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGrade(g)}
                      className={cn("h-11 rounded-xl border font-semibold", grade === g && "border-foreground bg-foreground text-background")}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
        {needsNote && (
          <div className="flex flex-wrap gap-2">
            {QUICK[kind].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setNote(q)}
                className={cn("rounded-full border px-3 py-1.5 text-left text-xs", note === q && "border-foreground bg-muted")}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="dec-note">{needsNote ? "Note to farmer (required)" : "Note (optional)"}</Label>
          <Textarea id="dec-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={copy.variant} size="lg" onClick={confirm} disabled={busy || (needsNote && !note.trim())}>
            {busy ? <Loader2 className="animate-spin" /> : copy.cta}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
