// Wizard step 2: capture photos (camera or gallery). Each file uploads on
// its own with a progress ring, and duplicate-hash flags show immediately.
"use client";

import { AlertTriangle, Camera, Clock, ImagePlus, Loader2, Video, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UploadTile } from "./types";

/**
 * @param tiles - uploads so far
 * @param onFiles - new files picked by the farmer
 * @param onRemove - remove a tile (and its server asset)
 * @param extra - optional block under the grid (visual check)
 */
export function MediaStep({
  tiles,
  onFiles,
  onRemove,
  extra,
  busyLabel,
}: {
  tiles: UploadTile[];
  onFiles: (files: File[]) => void;
  onRemove: (tile: UploadTile) => void;
  extra?: React.ReactNode;
  /** Shown while frames are being extracted from a video. */
  busyLabel?: string | null;
}) {
  const { t } = useI18n();
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = "";
  };
  const duplicates = tiles.filter((x) => x.media?.isDuplicate);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-dashed bg-card p-5 sm:p-7">
        <div className="bg-dots absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
        <div className="relative">
          <p className="text-lg font-semibold">{t("batch.capture")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("batch.captureHint")}</p>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            <Button type="button" size="lg" variant="brand" className="px-2" onClick={() => cameraRef.current?.click()}>
              <Camera /> {t("batch.photo")}
            </Button>
            <Button type="button" size="lg" variant="outline" className="px-2" onClick={() => videoRef.current?.click()}>
              <Video /> {t("batch.video")}
            </Button>
            <Button type="button" size="lg" variant="outline" className="px-2" onClick={() => galleryRef.current?.click()}>
              <ImagePlus /> {t("batch.gallery")}
            </Button>
          </div>
          {busyLabel && (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {busyLabel}
            </p>
          )}
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
        <input ref={videoRef} type="file" accept="video/*" capture="environment" className="sr-only" onChange={pick} />
        <input ref={galleryRef} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={pick} />
      </div>

      <AnimatePresence>
        {duplicates.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <p>{t("batch.duplicateWarn")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {tiles.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <AnimatePresence initial={false}>
            {tiles.map((tile) => (
              <motion.li
                key={tile.key}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-2xl bg-muted ring-1 ring-border",
                  tile.media?.isDuplicate && "ring-2 ring-warning",
                  tile.status === "error" && "ring-2 ring-destructive",
                )}
              >
                {tile.isVideo ? (
                  <video src={tile.previewUrl} muted playsInline className="size-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img src={tile.previewUrl} alt="" className="size-full object-cover" />
                )}
                {tile.kind === "frame" && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">{t("batch.frame")}</span>
                )}
                {tile.status === "uploading" && <ProgressRing progress={tile.progress} />}
                {tile.status === "error" && (
                  <span className="absolute inset-0 grid place-items-center bg-background/80 p-2 text-center text-[11px] text-destructive">
                    {tile.error}
                  </span>
                )}
                {tile.media?.isDuplicate && (
                  <span className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-warning px-1.5 py-1 text-[10px] leading-tight font-semibold text-black">
                    {t("batch.duplicateFlag")}
                  </span>
                )}
                {tile.media && !tile.media.isDuplicate && tile.media.capturedAt && (
                  <span className="absolute inset-x-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-lg bg-black/55 px-1.5 py-1 text-[10px] text-white">
                    <Clock className="size-3" /> EXIF ✓
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(tile)}
                  aria-label={t("batch.remove")}
                  className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-black/55 text-white opacity-90 transition hover:bg-black/75"
                >
                  <X className="size-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {extra}
    </div>
  );
}

/** Circular upload progress overlay. */
function ProgressRing({ progress }: { progress: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className="absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-[1px]">
      <svg viewBox="0 0 44 44" className="size-12 -rotate-90">
        <circle cx="22" cy="22" r={r} className="fill-none stroke-white/25" strokeWidth="4" />
        <motion.circle
          cx="22"
          cy="22"
          r={r}
          className="fill-none stroke-lime"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - progress) }}
        />
      </svg>
      {progress >= 1 && <Loader2 className="absolute size-4 animate-spin text-white" />}
    </span>
  );
}
