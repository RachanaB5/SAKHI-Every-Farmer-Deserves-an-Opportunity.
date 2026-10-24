// Visual quality check inside the harvest wizard: idle prompt → scanning
// animation over the frames → score gauge, grade, flags and summary, plus
// what the photos look like (with a one-tap fix when they don't match the
// crop) and a reminder that a blurry or dark photo never lowers the grade.
// Always labelled as a visual assessment, never a certification.
"use client";

import { AlertTriangle, Camera, CheckCircle2, RotateCw, ScanEye, ScanSearch, Sparkles, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AISourceBadge, QualityDisclaimer, flagLabel } from "@/components/ai/ai-labels";
import { ScoreGauge } from "@/components/ai/score-gauge";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { cropName, isCropSlug, type CropSlug } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { UploadTile } from "./types";

export interface QualityState {
  /** null when the photos couldn't be graded ("not detectable"). */
  score: number | null;
  grade: "A" | "B" | "C" | null;
  flags: string[];
  summary: string;
  disclaimer: string;
  source: "ai" | "fallback";
  note?: string;
  /** 0–1 trust in the score (photo sharpness / light). */
  confidence?: number;
  /** What the photos show, e.g. "tomato" or "cauliflower". */
  detected?: { label: string; crop: string | null } | null;
  match?: "match" | "mismatch" | "unsure" | null;
}

/** Freshness of these can't be judged from a photo; customer reviews set the grade. */
const REVIEW_LED = ["milk", "eggs", "chicken"];
const PHOTO_FLAGS = ["blurry_photo", "low_light", "overexposed"];

const SCAN_STEPS = ["batch.scan1", "batch.scan2", "batch.scan3", "batch.scan4"] as const;

/**
 * @param batchId - draft batch whose stored media is checked
 * @param tiles - current uploads (for the scanning preview)
 * @param result - last result (lifted to the wizard so Review can show it)
 */
export function QualityPanel({
  batchId,
  tiles,
  result,
  onResult,
  crop,
  onUseCrop,
}: {
  batchId: string | null;
  tiles: UploadTile[];
  result: QualityState | null;
  onResult: (r: QualityState) => void;
  /** Crop the farmer chose (to explain a mismatch). */
  crop?: CropSlug | null;
  /** Switches the harvest to the crop the photos show. */
  onUseCrop?: (crop: CropSlug) => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const stills = tiles.filter((x) => x.status === "done" && !x.isVideo).sort((a, b) => Number(b.kind === "frame") - Number(a.kind === "frame")).slice(0, 4);

  async function run() {
    if (!batchId || !stills.length) return toast.error(t("batch.addPhotoFirst"));
    setLoading(true);
    try {
      const started = Date.now();
      const r = await sendJSON<QualityState>("/api/ai/quality", { batchId });
      // Let the scan animation breathe even when the offline check is instant.
      await new Promise((res) => setTimeout(res, Math.max(0, 1800 - (Date.now() - started))));
      onResult(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <Scanning key="scan" previews={stills.map((s) => s.previewUrl)} label={t("batch.analysing")} />
      ) : result ? (
        <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <QualityCard result={result} onRerun={run} crop={crop} onUseCrop={onUseCrop} />
        </motion.div>
      ) : (
        <motion.div
          key="idle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col gap-4 rounded-3xl border bg-card p-5 sm:flex-row sm:items-center"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lime/30">
            <ScanEye className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("batch.score")}</p>
            <p className="text-sm text-muted-foreground">{t("batch.optionalPreview")}</p>
          </div>
          <Button type="button" variant="brand" onClick={run} disabled={!stills.length}>
            <Sparkles /> {t("batch.analyse")}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Laser-scan animation across the frames being checked. */
function Scanning({ previews, label }: { previews: string[]; label: string }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % SCAN_STEPS.length), 900);
    return () => clearInterval(id);
  }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-3xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {previews.map((src, k) => (
          <div key={src} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob/upload preview */}
            <img src={src} alt="" className="size-full object-cover saturate-50" />
            <div className="bg-grid absolute inset-0 opacity-60 mix-blend-overlay" />
            <span
              className="absolute inset-x-0 h-0.5 animate-scan bg-lime shadow-[0_0_18px_4px_var(--lime)]"
              style={{ animationDelay: `${k * 0.25}s` }}
            />
            <span className="absolute top-2 left-2 size-3 border-t-2 border-l-2 border-lime" />
            <span className="absolute top-2 right-2 size-3 border-t-2 border-r-2 border-lime" />
            <span className="absolute bottom-2 left-2 size-3 border-b-2 border-l-2 border-lime" />
            <span className="absolute right-2 bottom-2 size-3 border-r-2 border-b-2 border-lime" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="relative flex size-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-lime" />
          <span className="relative size-2.5 rounded-full bg-lime" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="font-mono text-xs text-muted-foreground"
            >
              {t(SCAN_STEPS[i])}…
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Result card (also used compactly on the Review step).
 * @param onRerun - optional re-check button
 * @param crop - the crop the farmer chose
 * @param onUseCrop - offered when the photos look like a different catalogue crop
 */
export function QualityCard({
  result,
  onRerun,
  compact = false,
  crop,
  onUseCrop,
}: {
  result: QualityState;
  onRerun?: () => void;
  compact?: boolean;
  crop?: CropSlug | null;
  onUseCrop?: (crop: CropSlug) => void;
}) {
  const { t, lang } = useI18n();
  const seen = result.detected ? (isCropSlug(result.detected.label) ? cropName(result.detected.label, lang) : result.detected.label.replace(/_/g, " ")) : null;
  const chosen = crop ? cropName(crop, lang) : null;
  const switchTo = result.match === "mismatch" && result.detected?.crop && isCropSlug(result.detected.crop) ? result.detected.crop : null;
  const photoIssue = result.flags.some((f) => PHOTO_FLAGS.includes(f));
  return (
    <div className="rounded-3xl border bg-card p-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        {result.score !== null ? (
          <ScoreGauge score={result.score} size={compact ? 104 : 132} label={t("batch.outOf100")} />
        ) : (
          <span className={cn("grid shrink-0 place-items-center rounded-full border-4 border-dashed border-muted-foreground/30 text-muted-foreground", compact ? "size-26" : "size-33")}>
            <ScanSearch className="size-9" />
          </span>
        )}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {result.grade ? (
              <>
                <span className="grid size-9 place-items-center rounded-xl bg-foreground text-lg font-semibold text-background">{result.grade}</span>
                <span className="text-sm font-medium">{t("common.grade", { grade: result.grade })}</span>
              </>
            ) : (
              <span className="text-lg font-semibold">{t(result.source === "fallback" ? "vision.unavailable" : "vision.notDetectable")}</span>
            )}
            <AISourceBadge source={result.source} />
          </div>
          {result.score === null && lang !== "en" && <p className="mt-3 text-sm text-muted-foreground">{t(result.source === "fallback" ? "vision.unavailableHelp" : "vision.notDetectableHelp")}</p>}
          {/* The summary is written in English; the score, grade and flags carry the result in other languages. */}
          {lang === "en" && <p className="mt-3 text-[15px] leading-relaxed">{result.summary}</p>}
          {result.match === "match" && chosen && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" /> {t("vision.matches", { crop: chosen })}
            </p>
          )}
          {result.match === "unsure" && chosen && <p className="mt-3 text-sm text-muted-foreground">{t("vision.unsure", { crop: chosen })}</p>}
          <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {result.flags.length === 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-1 text-xs font-medium text-success">
                <CheckCircle2 className="size-3.5" /> {t("batch.noIssues")}
              </span>
            ) : (
              result.flags.map((f) => (
                <span key={f} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", PHOTO_FLAGS.includes(f) ? "bg-muted" : "bg-warning/18")}>
                  {flagLabel(f, t)}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
      {result.flags.includes("stock_photo") && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-warning/50 bg-warning/10 p-3 text-sm font-medium">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {t("vision.stock")}
        </p>
      )}
      {result.match === "mismatch" && seen && chosen && !result.flags.includes("stock_photo") && (
        <div role="alert" className="mt-4 rounded-2xl border border-warning/50 bg-warning/10 p-3 text-sm">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {t("vision.mismatch", { seen, crop: chosen })}
          </p>
          <p className="mt-1 pl-6 text-muted-foreground">{t("vision.mismatchHelp", { crop: chosen })}</p>
          {switchTo && onUseCrop && (
            <Button type="button" size="sm" variant="outline" className="mt-2 ml-6" onClick={() => onUseCrop(switchTo)}>
              {t("vision.useCrop", { crop: cropName(switchTo, lang) })}
            </Button>
          )}
        </div>
      )}
      {crop && REVIEW_LED.includes(crop) ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-muted/60 p-3 text-sm">
          <Users className="mt-0.5 size-4 shrink-0" /> {t("vision.reviewsDecide", { crop: cropName(crop, lang) })}
        </p>
      ) : (
        photoIssue && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-muted/60 p-3 text-sm">
            <Camera className="mt-0.5 size-4 shrink-0" /> {t("vision.photoNote")}
          </p>
        )
      )}
      <div className="mt-4 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <QualityDisclaimer />
        {onRerun && (
          <Button type="button" variant="ghost" size="sm" onClick={onRerun} className="self-start sm:self-auto">
            <RotateCw /> {t("batch.recheck")}
          </Button>
        )}
      </div>
    </div>
  );
}
