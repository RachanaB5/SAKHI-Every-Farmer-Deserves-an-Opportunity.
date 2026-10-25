// Visual quality check inside the harvest wizard: idle prompt → scanning
// animation over the frames → score gauge, grade, flags and summary.
// Always labelled as a visual assessment, never a certification.
"use client";

import { CheckCircle2, RotateCw, ScanEye, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AISourceBadge, QualityDisclaimer, flagLabel } from "@/components/ai/ai-labels";
import { ScoreGauge } from "@/components/ai/score-gauge";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { sendJSON } from "@/lib/fetcher";
import type { UploadTile } from "./types";

export interface QualityState {
  score: number;
  grade: "A" | "B" | "C";
  flags: string[];
  summary: string;
  disclaimer: string;
  source: "ai" | "fallback";
  note?: string;
}

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
}: {
  batchId: string | null;
  tiles: UploadTile[];
  result: QualityState | null;
  onResult: (r: QualityState) => void;
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
          <QualityCard result={result} onRerun={run} />
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
 */
export function QualityCard({ result, onRerun, compact = false }: { result: QualityState; onRerun?: () => void; compact?: boolean }) {
  const { t, lang } = useI18n();
  return (
    <div className="rounded-3xl border bg-card p-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <ScoreGauge score={result.score} size={compact ? 104 : 132} label={t("batch.outOf100")} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="grid size-9 place-items-center rounded-xl bg-foreground text-lg font-semibold text-background">{result.grade}</span>
            <span className="text-sm font-medium">{t("common.grade", { grade: result.grade })}</span>
            <AISourceBadge source={result.source} />
          </div>
          {/* The summary is written in English; the score, grade and flags carry the result in other languages. */}
          {lang === "en" && <p className="mt-3 text-[15px] leading-relaxed">{result.summary}</p>}
          <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
            {result.flags.length === 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-1 text-xs font-medium text-success">
                <CheckCircle2 className="size-3.5" /> {t("batch.noIssues")}
              </span>
            ) : (
              result.flags.map((f) => (
                <span key={f} className="rounded-full bg-warning/18 px-2.5 py-1 text-xs font-medium">
                  {flagLabel(f, t)}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
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
