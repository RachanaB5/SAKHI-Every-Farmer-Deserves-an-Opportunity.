// New-harvest wizard (farmer interface): Details → Photos → Price → Review.
// Creates a DRAFT batch after step 1, uploads each file individually (hash
// + duplicate check server-side), and submits for admin verification at
// the end. Nothing is published to buyers until an admin approves.
"use client";

import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PriceAdvisor } from "@/components/farmer/price-advisor";
import { SuccessBurst } from "@/components/motion/success-burst";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import type { SerializedBatch, SerializedMedia } from "@/lib/batches";
import { isCropSlug, type CropSlug } from "@/lib/crops";
import { fetcher, sendJSON } from "@/lib/fetcher";
import { uploadWithProgress } from "@/lib/upload";
import { extractFrames } from "@/lib/video-frames";
import { DetailsStep } from "./details-step";
import { MediaStep } from "./media-step";
import { PriceStep } from "./price-step";
import { QualityCard, QualityPanel, type QualityState } from "./quality-panel";
import { ReviewStep } from "./review-step";
import { StepIndicator } from "./step-indicator";
import { VoiceCapture, type ParsedListingResult } from "./voice-capture";
import { isoDaysAgo, type DraftFields, type UploadTile } from "./types";

/** Blank form; computed per use so "today" is the farmer's today, not the module-load day. */
function emptyFields(): DraftFields {
  return {
    crop: null,
    quantity: "",
    unit: "kg",
    harvestDate: isoDaysAgo(0),
    price: "",
    notes: "",
    transcript: "",
    inputLanguage: "",
  };
}

/** Maps draft field names to the names used in `missing` lists. */
const MISSING_KEY: Partial<Record<keyof DraftFields, string>> = { quantity: "qty", crop: "crop", harvestDate: "harvestDate", price: "price", unit: "unit" };

/** Rebuilds wizard state from a saved DRAFT/RESUBMIT batch. */
function fromBatch(b: SerializedBatch): { fields: DraftFields; tiles: UploadTile[] } {
  const d = new Date(b.harvestDate);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    fields: {
      crop: b.crop as CropSlug,
      quantity: String(b.quantity),
      unit: b.unit as DraftFields["unit"],
      harvestDate: iso,
      price: b.proposedPrice ? String(b.proposedPrice) : "",
      notes: b.notes ?? "",
      transcript: b.transcript ?? "",
      inputLanguage: b.inputLanguage ?? "",
    },
    tiles: b.media.map((m) => ({
      key: m.id,
      previewUrl: m.url,
      progress: 1,
      status: "done" as const,
      kind: m.isFrame ? ("frame" as const) : ("media" as const),
      isVideo: m.type === "VIDEO",
      media: m,
    })),
  };
}

/**
 * @param farmerCrops - crops from the farmer's profile, shown first
 * @param initial - an editable batch to resume (draft or "needs changes")
 */
export function NewBatchWizard({ farmerCrops, initial }: { farmerCrops: CropSlug[]; initial?: SerializedBatch | null }) {
  const { t } = useI18n();
  const resumed = initial ? fromBatch(initial) : null;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [fields, setFields] = useState<DraftFields>(() => resumed?.fields ?? emptyFields());
  const [batchId, setBatchId] = useState<string | null>(initial?.id ?? null);
  const [tiles, setTiles] = useState<UploadTile[]>(resumed?.tiles ?? []);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<SerializedBatch | null>(null);
  const [quality, setQuality] = useState<QualityState | null>(null);
  const [framing, setFraming] = useState<string | null>(null);
  const tilesRef = useRef(tiles);
  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  // Revoke blob previews when leaving the page.
  useEffect(() => () => tilesRef.current.forEach((x) => URL.revokeObjectURL(x.previewUrl)), []);

  const set = (patch: Partial<DraftFields>) => {
    setFields((f) => ({ ...f, ...patch }));
    const cleared = Object.keys(patch).map((k) => MISSING_KEY[k as keyof DraftFields] ?? k);
    setMissing((m) => m.filter((k) => !cleared.includes(k)));
  };

  const payload = () => ({
    crop: fields.crop!,
    quantity: Number(fields.quantity),
    unit: fields.unit,
    harvestDate: fields.harvestDate,
    price: Number(fields.price) > 0 ? Number(fields.price) : undefined,
    notes: fields.notes || undefined,
    transcript: fields.transcript || undefined,
    inputLanguage: fields.inputLanguage || undefined,
  });

  /** Applies voice-extracted values as a draft; nothing is saved until the farmer continues. */
  function applyParsed(r: ParsedListingResult, transcript: string, lang: string) {
    const patch: Partial<DraftFields> = { transcript, inputLanguage: lang };
    if (r.crop && isCropSlug(r.crop)) patch.crop = r.crop;
    if (r.qty) patch.quantity = String(r.qty);
    if (r.unit) patch.unit = r.unit;
    if (r.harvestDate) patch.harvestDate = r.harvestDate;
    if (r.price) patch.price = String(r.price);
    setFields((f) => ({ ...f, ...patch }));
    // Highlight anything the farmer still has to fill in (price is asked on step 3).
    setMissing(r.missing.filter((m) => m !== "unit" && m !== "price"));
  }

  function validateDetails(): boolean {
    const gaps: string[] = [];
    if (!fields.crop) gaps.push("crop");
    if (!(Number(fields.quantity) > 0)) gaps.push("qty");
    if (!fields.harvestDate) gaps.push("harvestDate");
    setMissing(gaps);
    if (gaps.length) {
      const names = gaps.map((g) => (g === "qty" ? t("batch.quantity") : g === "crop" ? t("batch.crop") : t("batch.harvestDate")));
      toast.error(t("batch.missing", { fields: names.join(", ") }));
    }
    return gaps.length === 0;
  }

  /** Creates the DRAFT on first save, then keeps it in sync. */
  async function saveDraft() {
    if (!batchId) {
      const b = await sendJSON<SerializedBatch>("/api/batches", payload());
      setBatchId(b.id);
      return b.id;
    }
    await sendJSON(`/api/batches/${batchId}`, { action: "save", ...payload() }, "PATCH");
    return batchId;
  }

  function go(to: number) {
    setDir(to > step ? 1 : -1);
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function next() {
    try {
      setBusy(true);
      if (step === 0) {
        if (!validateDetails()) return;
        await saveDraft();
        go(1);
      } else if (step === 1) {
        if (tiles.some((x) => x.status === "uploading")) return toast(t("batch.waitUploads"));
        if (!tiles.some((x) => x.status === "done" && x.media?.type === "IMAGE")) {
          return toast.error(t("batch.needPhoto"));
        }
        go(2);
      } else if (step === 2) {
        if (!(Number(fields.price) > 0)) {
          setMissing(["price"]);
          return toast.error(t("batch.missing", { fields: t("batch.price") }));
        }
        await saveDraft();
        go(3);
      } else {
        const b = await sendJSON<SerializedBatch>(`/api/batches/${batchId}`, { action: "submit", ...payload() }, "PATCH");
        setSubmitted(b);
        toast.success(t("batch.submitted"));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addFiles(files: File[], kind: UploadTile["kind"] = "media") {
    if (!batchId) return;
    setQuality(null);
    for (const file of files) {
      // Videos upload as evidence; three stills are pulled out client-side for the visual check.
      if (file.type.startsWith("video/") && kind === "media") {
        setFraming(t("batch.extractingFrames"));
        extractFrames(file)
          .then((frames) => addFiles(frames, "frame"))
          .catch(() => toast.error(t("batch.framesFailed")))
          .finally(() => setFraming(null));
      }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const tile: UploadTile = {
        key,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "uploading",
        kind,
        isVideo: file.type.startsWith("video/"),
      };
      setTiles((ts) => [...ts, tile]);
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      uploadWithProgress<SerializedMedia>(`/api/batches/${batchId}/media`, form, (p) =>
        setTiles((ts) => ts.map((x) => (x.key === key ? { ...x, progress: p } : x))),
      )
        .then((media) => {
          setTiles((ts) => {
            // Same bytes uploaded twice → server returns the existing asset; keep one tile.
            if (ts.some((x) => x.key !== key && x.media?.id === media.id)) {
              URL.revokeObjectURL(tile.previewUrl);
              return ts.filter((x) => x.key !== key);
            }
            return ts.map((x) => (x.key === key ? { ...x, status: "done", progress: 1, media } : x));
          });
          if (media.isDuplicate) toast.warning(t("batch.duplicateToast"));
        })
        .catch((e: Error) => {
          setTiles((ts) => ts.map((x) => (x.key === key ? { ...x, status: "error", error: e.message } : x)));
          toast.error(e.message);
        });
    }
  }

  async function removeTile(tile: UploadTile) {
    setQuality(null);
    setTiles((ts) => ts.filter((x) => x.key !== tile.key));
    URL.revokeObjectURL(tile.previewUrl);
    if (tile.media && batchId) {
      await fetcher(`/api/batches/${batchId}/media/${tile.media.id}`, { method: "DELETE" }).catch(() => {});
    }
  }

  if (submitted) return <SuccessView batch={submitted} onAnother={() => {
    setSubmitted(null);
    setFields(emptyFields());
    setTiles([]);
    setBatchId(null);
    setQuality(null);
    setStep(0);
  }} />;

  const steps = [t("batch.stepDetails"), t("batch.stepMedia"), t("batch.stepPrice"), t("batch.stepReview")];
  const crops = [...farmerCrops, ...(["tomato", "onion", "potato", "spinach", "carrot", "beans", "brinjal", "cabbage", "milk", "eggs", "chicken"] as CropSlug[]).filter((c) => !farmerCrops.includes(c))];

  return (
    <div>
      <PageHeader title={t("batch.title")} back={{ href: "/farmer", label: t("common.back") }} />
      {initial?.status === "RESUBMIT" && initial.adminNote && (
        <p className="-mt-2 mb-5 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-semibold">{t("batch.adminAsked")}</span> {initial.adminNote}
        </p>
      )}
      <StepIndicator steps={steps} current={step} onJump={(i) => go(i)} />

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          initial={{ opacity: 0, x: dir * 36, filter: "blur(4px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: dir * -36, filter: "blur(4px)" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 0 && (
            <DetailsStep fields={fields} set={set} missing={missing} cropOrder={crops} voice={<VoiceCapture onParsed={applyParsed} />} />
          )}
          {step === 1 && (
            <MediaStep
              tiles={tiles}
              onFiles={(f) => addFiles(f)}
              onRemove={removeTile}
              busyLabel={framing}
              extra={tiles.some((x) => x.status === "done") && <QualityPanel batchId={batchId} tiles={tiles} result={quality} onResult={setQuality} />}
            />
          )}
          {step === 2 && (
            <PriceStep
              fields={fields}
              set={set}
              advisor={
                fields.crop && (
                  <PriceAdvisor
                    crop={fields.crop}
                    grade={quality?.grade ?? "ANY"}
                    yourPrice={Number(fields.price) || undefined}
                    onUse={(p) => set({ price: String(p) })}
                  />
                )
              }
            />
          )}
          {step === 3 && <ReviewStep fields={fields} tiles={tiles} quality={quality && <QualityCard result={quality} compact />} />}
        </motion.div>
      </AnimatePresence>

      <div className="glass sticky bottom-0 z-30 -mx-4 mt-8 border-y px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 lg:bottom-4 lg:mx-0 lg:rounded-2xl lg:border lg:pb-3">
        <div className="flex gap-3">
          {step > 0 && (
            <Button type="button" variant="outline" size="lg" onClick={() => go(step - 1)} disabled={busy}>
              <ArrowLeft /> <span className="sr-only sm:not-sr-only">{t("common.back")}</span>
            </Button>
          )}
          <Button type="button" size="lg" variant={step === 3 ? "brand" : "default"} className="flex-1" onClick={next} disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : step === 3 ? (
              <>
                {t("batch.submit")} <Send />
              </>
            ) : (
              <>
                {t("common.next")} <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuccessView({ batch, onAnother }: { batch: SerializedBatch; onAnother: () => void }) {
  const { t } = useI18n();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-10 text-center">
      <SuccessBurst />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">{t("batch.sentTitle")}</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">{t("batch.submitted")}</p>
      {batch.aiQualityScore !== null && (
        <p className="mt-4 rounded-full border px-4 py-1.5 text-sm">
          {t("batch.score")}: <span className="tabular font-semibold">{batch.aiQualityScore}/100</span> · {t("common.grade", { grade: batch.grade ?? "-" })}
        </p>
      )}
      <div className="mt-8 grid w-full max-w-sm gap-3">
        <Button asChild size="lg">
          <Link href="/farmer">{t("home.title")}</Link>
        </Button>
        <Button size="lg" variant="outline" onClick={onAnother}>
          {t("dash.newHarvest")}
        </Button>
      </div>
    </motion.div>
  );
}
