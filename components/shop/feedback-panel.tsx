// Post-delivery feedback: animated star rating, quality-issue chips,
// comment and optional photo. A low rating with an issue opens a dispute
// that FoodFlow's team reviews (refunds are handled by admins).
"use client";

import { Camera, Check, Loader2, Star, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MediaImage } from "@/components/common/media-image";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ReviewImages } from "@/components/common/review-images";
import { Textarea } from "@/components/ui/textarea";
import { uploadWithProgress } from "@/lib/upload";
import { compressReviewImage } from "@/lib/review-image-compression";
import { MAX_REVIEW_IMAGES, MAX_REVIEW_IMAGE_BYTES, MAX_REVIEW_UPLOAD_BYTES, REVIEW_IMAGE_TYPES } from "@/lib/review-media";
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
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const previewUrls = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

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
        <ReviewImages images={order.feedback.photoUrls} />
        {order.status === "DISPUTED" && <p className="mt-2 rounded-xl bg-warning/12 p-2 text-sm">Our team is reviewing this, you&apos;ll hear back within 24 hours.</p>}
      </section>
    );
  }

  async function pickPhotos(files: FileList | null) {
    if (!files) return;
    setUploadError("");
    const accepted: File[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      if (!REVIEW_IMAGE_TYPES.includes(file.type as (typeof REVIEW_IMAGE_TYPES)[number])) {
        errors.push("Unsupported file type. Choose JPEG, PNG or WebP images.");
      } else if (file.size > MAX_REVIEW_IMAGE_BYTES) {
        errors.push("Each image must be 5 MB or smaller.");
      } else {
        accepted.push(file);
      }
    }
    const available = MAX_REVIEW_IMAGES - photos.length;
    if (accepted.length > available) errors.push(`You can attach up to ${MAX_REVIEW_IMAGES} images.`);
    const nextFiles = accepted.slice(0, Math.max(available, 0));
    if (fileRef.current) fileRef.current.value = "";
    if (!nextFiles.length) {
      if (errors.length) setUploadError([...new Set(errors)].join(" "));
      return;
    }
    setPreparing(true);
    const nextPhotos: { file: File; preview: string }[] = [];
    try {
      for (const file of nextFiles) {
        try {
          const compressed = await compressReviewImage(file);
          const preview = URL.createObjectURL(file);
          previewUrls.current.add(preview);
          nextPhotos.push({ file: compressed, preview });
        } catch {
          errors.push("An image couldn't be prepared. Choose another file and try again.");
        }
      }
      let totalBytes = photos.reduce((total, photo) => total + photo.file.size, 0);
      const withinLimit: typeof nextPhotos = [];
      for (const photo of nextPhotos) {
        if (totalBytes + photo.file.size > MAX_REVIEW_UPLOAD_BYTES) {
          URL.revokeObjectURL(photo.preview);
          previewUrls.current.delete(photo.preview);
          errors.push("Selected images must total 4 MB or less after compression.");
        } else {
          withinLimit.push(photo);
          totalBytes += photo.file.size;
        }
      }
      if (withinLimit.length) setPhotos((current) => [...current, ...withinLimit]);
      if (errors.length) setUploadError([...new Set(errors)].join(" "));
    } finally {
      setPreparing(false);
    }
  }

  function removePhoto(preview: string) {
    URL.revokeObjectURL(preview);
    previewUrls.current.delete(preview);
    setPhotos((current) => current.filter((photo) => photo.preview !== preview));
    setUploadError("");
  }

  async function submit() {
    if (!rating) return toast.error("Tap the stars to rate");
    setBusy(true);
    setProgress(0);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("rating", String(rating));
      form.append("issue", issue);
      if (comment) form.append("comment", comment);
      for (const photo of photos) form.append("photos", photo.file);
      const r = await uploadWithProgress<{ disputed: boolean }>(`/api/orders/${order.id}/feedback`, form, setProgress);
      toast.success(r.disputed ? "Thanks, we've opened a case and will refund if needed" : "Thanks for rating your farmer!");
      onDone();
    } catch (e) {
      const message = (e as Error).message;
      setUploadError(message);
      toast.error(message);
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
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {photos.map((photo, index) => (
                  <span key={photo.preview} className="relative size-16 overflow-hidden rounded-xl">
                    <MediaImage src={photo.preview} alt={`Selected review image ${index + 1}`} sizes="64px" />
                    <button type="button" disabled={busy || preparing} onClick={() => removePhoto(photo.preview)} className="absolute top-0.5 right-0.5 grid size-6 place-items-center rounded-full bg-black/60 text-white disabled:opacity-50" aria-label={`Remove image ${index + 1}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {photos.length < MAX_REVIEW_IMAGES && (
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy || preparing}>
                    <Camera /> Upload Images
                  </Button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept={REVIEW_IMAGE_TYPES.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(e) => void pickPhotos(e.target.files)}
                  disabled={busy || preparing}
                />
                <span className="text-sm text-muted-foreground">
                  {preparing ? "Preparing images…" : `${photos.length} of ${MAX_REVIEW_IMAGES} images selected`}
                </span>
                <Button variant="brand" className="ml-auto" onClick={submit} disabled={busy || preparing}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} Submit
                </Button>
              </div>
              {busy && (
                <div className="space-y-1" aria-live="polite">
                  <Progress value={progress * 100} aria-label="Review upload progress" />
                  <p className="text-xs text-muted-foreground">
                    {photos.length ? "Uploading images" : "Submitting review"}… {Math.round(progress * 100)}%
                  </p>
                </div>
              )}
              {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
            </div>
            {rating <= 2 && issue !== "NONE" && <p className="mt-2 text-xs text-muted-foreground">This opens a case with FoodFlow. If the produce wasn&apos;t right, we refund you.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
