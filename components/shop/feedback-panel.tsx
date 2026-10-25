// Post-delivery feedback: animated star rating, quality-issue chips, which
// item it's about (multi-item orders), comment and optional photo. Reviews
// move the item's live grade; a photo is checked by our vision model and a
// photo-backed complaint counts more. A low rating with an issue opens a
// dispute that FoodFlow's team reviews (refunds are handled by admins).
"use client";

import { Camera, Check, Loader2, Star, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MediaImage } from "@/components/common/media-image";
import { ReviewImages } from "@/components/common/review-images";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_REVIEW_IMAGES, MAX_REVIEW_IMAGE_BYTES, MAX_REVIEW_UPLOAD_BYTES, REVIEW_IMAGE_TYPES } from "@/lib/review-media";
import { compressReviewImage } from "@/lib/review-image-compression";
import type { SerializedOrder } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

function uploadReview(url: string, form: FormData, onProgress: (progress: number) => void): Promise<{ disputed: boolean }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    request.onload = () => {
      let response: { ok?: boolean; data?: { disputed: boolean }; error?: string };
      try { response = JSON.parse(request.responseText); } catch { reject(new Error(`Unexpected response (${request.status})`)); return; }
      if (request.status < 200 || request.status >= 300 || response.ok !== true || !response.data) { reject(new Error(response.error ?? `Upload failed (${request.status})`)); return; }
      resolve(response.data);
    };
    request.send(form);
  });
}

/** Issues about the produce itself, where a photo helps most. */
const PRODUCE_ISSUES = ["NOT_FRESH", "DAMAGED", "WRONG_ITEM"];

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
  const { tx } = useI18n();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [issue, setIssue] = useState("NONE");
  const [itemId, setItemId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<string[]>([]);
  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function pickPhotos(selected: FileList | null) {
    if (!selected?.length) return;
    setFileError(null);
    const incoming = Array.from(selected);
    const accepted: File[] = [];
    for (const photo of incoming) {
      if (!REVIEW_IMAGE_TYPES.some((type) => type === photo.type)) { setFileError(tx("Only JPEG, PNG, and WebP images are supported.")); return; }
      if (photo.size > MAX_REVIEW_IMAGE_BYTES) { setFileError(tx("Each image must be 5 MB or smaller.")); return; }
      if (photos.length + accepted.length >= MAX_REVIEW_IMAGES) { setFileError(tx("You can add up to 5 images per review.")); return; }
      accepted.push(photo);
    }
    setPreparing(true);
    try {
      const prepared = await Promise.all(accepted.map(compressReviewImage));
      if ([...photos, ...prepared].reduce((total, photo) => total + photo.size, 0) > MAX_REVIEW_UPLOAD_BYTES) {
        setFileError(tx("The selected images are too large to upload. Remove an image or choose smaller files."));
        return;
      }
      const urls = prepared.map((photo) => URL.createObjectURL(photo));
      previewUrls.current.push(...urls);
      setPhotos((current) => [...current, ...prepared]);
      setPreviews((current) => [...current, ...urls]);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : tx("Unable to prepare these images."));
    } finally { setPreparing(false); }
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(previews[index]);
    previewUrls.current = previewUrls.current.filter((url) => url !== previews[index]);
    setPhotos((current) => current.filter((_, i) => i !== index));
    setPreviews((current) => current.filter((_, i) => i !== index));
    setFileError(null);
  }

  if (!["DELIVERED", "COLLECTED", "DISPUTED"].includes(order.status)) return null;
  if (order.feedback) {
    return (
      <section className="rounded-3xl border bg-card p-5">
        <p className="font-semibold">{tx("Your feedback")}</p>
        <div className="mt-2 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={cn("size-5", i < order.feedback!.rating ? "fill-warning text-warning" : "text-muted-foreground/30")} />
          ))}
        </div>
        {order.feedback.issue && order.feedback.issue !== "NONE" && (
          <p className="mt-2 text-sm">
            {tx("Reported: {issue}", { issue: tx(ISSUES.find((x) => x.v === order.feedback!.issue)?.l ?? "") })}
            {order.feedback.listingId && <span className="text-muted-foreground"> · {order.items.find((i) => i.listingId === order.feedback!.listingId)?.title}</span>}
          </p>
        )}
        {order.feedback.photoVerdict === "supports" && <p className="mt-1 text-xs text-muted-foreground">{tx("Your photo backed this up, so it counts more towards the farm's grade.")}</p>}
        {order.feedback.comment && <p className="mt-1 text-sm text-muted-foreground">“{order.feedback.comment}”</p>}
        <ReviewImages images={order.feedback.photoUrls} label={tx("Review image")} />
        {order.status === "DISPUTED" && <p className="mt-2 rounded-xl bg-warning/12 p-2 text-sm">{tx("Our team is reviewing this, you'll hear back within 24 hours.")}</p>}
      </section>
    );
  }

  async function submit() {
    if (!rating) return toast.error(tx("Tap the stars to rate"));
    setBusy(true);
    try {
      const form = new FormData();
      form.append("rating", String(rating));
      form.append("issue", issue);
      if (comment) form.append("comment", comment);
      for (const photo of photos) form.append("photos", photo);
      if (itemId) form.append("listingId", itemId);
      setUploadProgress(0);
      const r = await uploadReview(`/api/orders/${order.id}/feedback`, form, setUploadProgress);
      toast.success(tx(r.disputed ? "Thanks, we've opened a case and will refund if needed" : "Thanks for rating your farmer!"));
      onDone();
    } catch (e) {
      toast.error(tx((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || rating;
  const items = [...new Map(order.items.map((i) => [i.listingId, i])).values()];
  return (
    <section className="rounded-3xl border bg-card p-5">
      <p className="font-semibold">{tx("How was it?")}</p>
      <p className="text-sm text-muted-foreground">{tx("Your rating helps {name} and other shoppers.", { name: order.farmer.name })}</p>
      <div className="mt-3 flex gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label={tx("Rating")}>
        {Array.from({ length: 5 }).map((_, i) => (
          <motion.button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i + 1}
            aria-label={tx(i ? "{n} stars" : "{n} star", { n: i + 1 })}
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
                  {tx(x.l)}
                </button>
              ))}
            </div>
            {issue !== "NONE" && items.length > 1 && (
              <div className="mt-3">
                <p className="text-sm font-medium">{tx("Which item?")}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {[{ listingId: null, title: tx("Everything") }, ...items].map((i) => (
                    <button
                      key={i.listingId ?? "all"}
                      type="button"
                      onClick={() => setItemId(i.listingId)}
                      className={cn("min-h-10 rounded-full border px-3 text-sm", itemId === i.listingId && "border-foreground bg-foreground text-background")}
                    >
                      {i.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Textarea className="mt-3" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={tx("Anything to add? (optional)")} maxLength={500} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2">
                {previews.map((preview, index) => (
                  <span key={preview} className="relative size-16 overflow-hidden rounded-xl">
                    <MediaImage src={preview} sizes="64px" />
                    <button type="button" onClick={() => removePhoto(index)} className="absolute top-0.5 right-0.5 grid size-6 place-items-center rounded-full bg-black/60 text-white" aria-label={tx("Remove image {n}", { n: index + 1 })}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy || preparing || photos.length >= MAX_REVIEW_IMAGES}>
                {preparing ? <Loader2 className="animate-spin" /> : <Camera />} {tx("Upload Images")} ({photos.length}/{MAX_REVIEW_IMAGES})
              </Button>
              <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void pickPhotos(e.target.files); e.currentTarget.value = ""; }} />
              <Button variant="brand" className="ml-auto" onClick={submit} disabled={busy || preparing}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} {busy && photos.length ? String(uploadProgress) + "% " : ""}{tx("Submit")}
              </Button>
            </div>
            {fileError && <p role="alert" className="mt-2 text-sm text-destructive">{fileError}</p>}
            {PRODUCE_ISSUES.includes(issue) && photos.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{tx("A photo of the produce helps: complaints with a photo count more towards the farm's quality grade.")}</p>}
            {rating <= 2 && issue !== "NONE" && <p className="mt-2 text-xs text-muted-foreground">{tx("This opens a case with FoodFlow. If the produce wasn't right, we refund you.")}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
