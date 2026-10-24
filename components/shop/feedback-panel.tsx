// Post-delivery feedback: animated star rating, quality-issue chips,
// comment and optional photo. A low rating with an issue opens a dispute
// that FoodFlow's team reviews (refunds are handled by admins).
"use client";

import { Camera, Check, Loader2, Star, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MediaImage } from "@/components/common/media-image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendForm } from "@/lib/fetcher";
import type { SerializedOrder } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

const ISSUES = [
  { v: "NONE", l: "All good" },
  { v: "NOT_FRESH", l: "Not fresh" },
  { v: "DAMAGED", l: "Damaged" },
  { v: "SHORT_QTY", l: "Less than ordered" },
  { v: "WRONG_ITEM", l: "Wrong item" },
  { v: "LATE", l: "Late" },
];

/** Shown on the tracking page once the order is handed over. */
export function FeedbackPanel({ order, onDone }: { order: SerializedOrder; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [issue, setIssue] = useState("NONE");
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const pickPhoto = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!["DELIVERED", "COLLECTED", "DISPUTED"].includes(order.status)) return null;
  if (order.feedback) {
    return (
      <section className="rounded-3xl border bg-card p-5">
        <p className="font-semibold">Your feedback</p>
        <div className="mt-2 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={cn("size-5", i < order.feedback!.rating ? "fill-warning text-warning" : "text-muted-foreground/30")} />
          ))}
        </div>
        {order.feedback.issue && order.feedback.issue !== "NONE" && <p className="mt-2 text-sm">Reported: {ISSUES.find((x) => x.v === order.feedback!.issue)?.l}</p>}
        {order.feedback.comment && <p className="mt-1 text-sm text-muted-foreground">“{order.feedback.comment}”</p>}
        {order.status === "DISPUTED" && <p className="mt-2 rounded-xl bg-warning/12 p-2 text-sm">Our team is reviewing this, you&apos;ll hear back within 24 hours.</p>}
      </section>
    );
  }

  async function submit() {
    if (!rating) return toast.error("Tap the stars to rate");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("rating", String(rating));
      form.append("issue", issue);
      if (comment) form.append("comment", comment);
      if (photo) form.append("photo", photo);
      const r = await sendForm<{ disputed: boolean }>(`/api/orders/${order.id}/feedback`, form);
      toast.success(r.disputed ? "Thanks, we've opened a case and will refund if needed" : "Thanks for rating your farmer!");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || rating;
  return (
    <section className="rounded-3xl border bg-card p-5">
      <p className="font-semibold">How was it?</p>
      <p className="text-sm text-muted-foreground">Your rating helps {order.farmer.name} and other shoppers.</p>
      <div className="mt-3 flex gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating">
        {Array.from({ length: 5 }).map((_, i) => (
          <motion.button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i + 1}
            aria-label={`${i + 1} star${i ? "s" : ""}`}
            whileTap={{ scale: 0.8 }}
            animate={{ scale: shown > i ? 1.12 : 1, rotate: shown > i ? [0, -12, 0] : 0 }}
            onMouseEnter={() => setHover(i + 1)}
            onClick={() => {
              setRating(i + 1);
              if (i + 1 >= 4) setIssue("NONE");
            }}
            className="grid size-11 place-items-center"
          >
            <Star className={cn("size-8 transition-colors", shown > i ? "fill-warning text-warning" : "text-muted-foreground/30")} />
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {rating > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="overflow-hidden">
            <div className="mt-3 flex flex-wrap gap-2">
              {ISSUES.map((x) => (
                <button key={x.v} type="button" onClick={() => setIssue(x.v)} className={cn("min-h-10 rounded-full border px-3 text-sm", issue === x.v && "border-foreground bg-foreground text-background")}>
                  {x.l}
                </button>
              ))}
            </div>
            <Textarea className="mt-3" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything to add? (optional)" maxLength={500} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {photo && preview ? (
                <span className="relative size-16 overflow-hidden rounded-xl">
                  <MediaImage src={preview} sizes="64px" />
                  <button type="button" onClick={() => pickPhoto(null)} className="absolute top-0.5 right-0.5 grid size-6 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove photo">
                    <X className="size-3" />
                  </button>
                </span>
              ) : (
                issue !== "NONE" && (
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                    <Camera /> Add a photo
                  </Button>
                )
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} />
              <Button variant="brand" className="ml-auto" onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} Submit
              </Button>
            </div>
            {rating <= 2 && issue !== "NONE" && <p className="mt-2 text-xs text-muted-foreground">This opens a case with FoodFlow. If the produce wasn&apos;t right, we refund you.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
