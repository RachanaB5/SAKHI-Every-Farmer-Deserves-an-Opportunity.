// Admin review of one harvest batch: evidence gallery (video, photos,
// frames, EXIF, hashes), AI visual assessment, duplicate-hash warnings,
// farmer declaration vs market, farmer history and audit trail — then
// approve / request changes / reject. Every decision is audit-logged.
"use client";

import { AlertTriangle, ArrowLeft, Check, Clock, Copy, Fingerprint, MapPin, MessageSquareQuote, RotateCcw, ShieldCheck, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { AISourceBadge, QualityDisclaimer, flagLabel } from "@/components/ai/ai-labels";
import { ScoreGauge } from "@/components/ai/score-gauge";
import { MediaImage } from "@/components/common/media-image";
import { ErrorState, SkeletonBlock } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import type { SerializedBatch } from "@/lib/batches";
import { cropName } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";
import { formatDate, formatDateTime, formatINR, formatQty, timeAgo } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DecisionDialog, type DecisionKind } from "./decision-dialog";
import { queueKey, type QueueItem } from "./review-list";

interface Detail extends SerializedBatch {
  listing: { id: string; status: string } | null;
  farmer: {
    id: string;
    name: string;
    phone: string;
    area: string | null;
    village: string | null;
    farmName: string | null;
    reliability: number;
    memberSince: string;
    history: { approved: number; rejected: number; resubmits: number; complaints: number; delivered: number };
    recent: { id: string; crop: string; status: string; aiQualityScore: number | null; createdAt: string }[];
  };
  duplicates: { id: string; crop: string; status: string; farmer: string; createdAt: string }[];
  price: { suggested: number; min: number; max: number; mandi: string; trend: string; trendPct: number } | null;
  categoryEnabled: boolean;
  trail: { id: string; action: string; actor: string; role: string | null; createdAt: string }[];
}

const ACTION_LABEL: Record<string, string> = {
  BATCH_SUBMITTED: "Submitted by farmer",
  BATCH_RESUBMITTED: "Resubmitted with changes",
  BATCH_APPROVED: "Approved, listing created",
  BATCH_REJECTED: "Rejected",
  BATCH_RESUBMIT_REQUESTED: "Changes requested",
  MEDIA_DUPLICATE_FLAGGED: "Duplicate photo flagged",
};

/** Review screen for `/admin/review/[id]`. */
export function ReviewDetail({ id }: { id: string }) {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/admin/batches/${id}`);
  const [active, setActive] = useState(0);
  const [decision, setDecision] = useState<DecisionKind | null>(null);

  if (isLoading) return <DetailSkeleton />;
  if (error || !data) return <ErrorState message={error?.message} onRetry={() => mutate()} />;

  const media = data.media;
  const current = media[active] ?? media[0];
  const pending = data.status === "PENDING_REVIEW";
  const priceOutlier = data.price && data.proposedPrice ? data.proposedPrice > data.price.max * 1.1 || data.proposedPrice < data.price.min * 0.8 : false;

  async function decide(kind: DecisionKind, input: { note?: string; price?: number; grade?: "A" | "B" | "C" }) {
    try {
      await sendJSON(`/api/admin/batches/${id}`, { decision: kind, ...input });
      toast.success(kind === "APPROVE" ? "Approved, listing is live" : kind === "REJECT" ? "Batch rejected" : "Sent back to the farmer");
      setDecision(null);
      // Jump to the next pending batch so the queue keeps flowing.
      const queue = await globalMutate<QueueItem[]>(queueKey("PENDING_REVIEW"));
      const next = queue?.find((b) => b.id !== id);
      await mutate();
      router.push(next ? `/admin/review/${next.id}` : "/admin/review");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    // Container queries: the pane is narrow beside the queue on desktop, so layout follows its width, not the viewport.
    <div className="@container pb-4">
      <Link href="/admin/review" className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden">
        <ArrowLeft className="size-4" /> Queue
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{cropName(data.crop)}</h1>
            <StatusBadge status={data.status} pulse={pending} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{data.farmer.name}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {data.farmer.village ?? "-"} → {data.farmer.area}
            </span>
            <span>· submitted {timeAgo(data.createdAt)}</span>
          </p>
        </div>
      </div>

      {data.duplicates.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl border border-warning/50 bg-warning/12 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-5 text-warning" /> Duplicate image flag
          </p>
          <p className="mt-1 text-sm">
            {data.media.filter((m) => m.isDuplicate).length} file(s) have exactly the same SHA-256 hash as media on:
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.duplicates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Copy className="size-3.5" /> {cropName(d.crop)} batch by <span className="font-medium">{d.farmer}</span>
                <StatusBadge status={d.status} /> <span className="text-muted-foreground">{timeAgo(d.createdAt)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">A flag, not proof, the same photo can be re-used innocently. Use your judgement.</p>
        </motion.div>
      )}

      <div className="mt-5 grid gap-5 @3xl:grid-cols-[1.2fr_1fr]">
        {/* Evidence */}
        <section>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted">
            <AnimatePresence mode="wait">
              {current && (
                <motion.div key={current.id} initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                  {current.type === "VIDEO" ? (
                    <video src={current.url} controls playsInline className="size-full bg-black object-contain" />
                  ) : (
                    <MediaImage src={current.url} sizes="(max-width: 1280px) 100vw, 640px" priority />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {current?.isDuplicate && (
              <span className="absolute top-3 left-3 rounded-full bg-warning px-3 py-1 text-xs font-semibold text-black">Duplicate flag</span>
            )}
          </div>
          {current && (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Clock className="size-3.5" /> {current.capturedAt ? `EXIF capture ${formatDateTime(current.capturedAt)}` : "No EXIF capture time"}
                {current.isFrame && " · frame from in-app video"}
              </p>
              <p className="flex items-center gap-1.5 break-all">
                <Fingerprint className="size-3.5 shrink-0" /> sha256 {current.sha256.slice(0, 16)}…
              </p>
              {current.provenanceNote && <p>{current.provenanceNote}</p>}
            </div>
          )}
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {media.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-xl bg-muted ring-offset-2 ring-offset-background",
                  i === active ? "ring-2 ring-foreground" : "ring-1 ring-border",
                  m.isDuplicate && "ring-2 ring-warning",
                )}
                aria-label={`Show file ${i + 1}`}
              >
                {m.type === "VIDEO" ? (
                  <span className="grid size-full place-items-center bg-black text-[10px] font-semibold text-white">VIDEO</span>
                ) : (
                  <MediaImage src={m.url} sizes="96px" />
                )}
                {m.isFrame && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] text-white">frame</span>}
              </button>
            ))}
          </div>
        </section>

        {/* AI assessment */}
        <section className="@container/ai rounded-3xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Visual assessment</p>
            <AISourceBadge source={data.aiSource} />
          </div>
          {data.aiQualityScore !== null ? (
            <div className="mt-4 flex flex-col items-center gap-4 @md/ai:flex-row @md/ai:items-start">
              <ScoreGauge score={data.aiQualityScore} size={116} label={`Grade ${data.grade ?? "-"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-relaxed">{data.aiSummary}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.aiFlags.length ? (
                    data.aiFlags.map((f) => (
                      <span key={f} className="rounded-full bg-warning/20 px-2.5 py-1 text-xs font-medium">
                        {flagLabel(f, (k) => translate("en", k))}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full bg-success/12 px-2.5 py-1 text-xs font-medium text-success">No visual flags</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No assessment yet.</p>
          )}
          <QualityDisclaimer className="mt-4 border-t pt-3" />
        </section>
      </div>

      <div className="mt-5 grid gap-5 @2xl:grid-cols-2">
        {/* Declaration */}
        <section className="rounded-3xl border bg-card p-5">
          <p className="font-semibold">Farmer declaration</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Fact k="Quantity" v={formatQty(data.quantity, data.unit)} />
            <Fact k="Harvested" v={formatDate(data.harvestDate)} />
            <Fact k="Asking price" v={data.proposedPrice ? `${formatINR(data.proposedPrice)}/${data.unit}` : "-"} warn={priceOutlier} />
            <Fact k="Indicative" v={data.price ? `${formatINR(data.price.suggested)} (${formatINR(data.price.min)}–${formatINR(data.price.max)})` : "-"} />
          </dl>
          {priceOutlier && <p className="mt-2 text-xs text-tomato">Asking price is outside the indicative range for {data.price?.mandi}.</p>}
          {!data.categoryEnabled && (
            <p className="mt-2 rounded-xl bg-warning/12 p-2 text-xs">This category isn&apos;t enabled in {data.farmer.area} yet, buyers there won&apos;t see it until it&apos;s switched on in Controls.</p>
          )}
          {data.notes && <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">“{data.notes}”</p>}
          {data.transcript && (
            <p className="mt-3 flex gap-2 rounded-xl border p-3 text-sm">
              <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="text-xs text-muted-foreground">Voice ({data.inputLanguage}):</span> {data.transcript}
              </span>
            </p>
          )}
        </section>

        {/* Farmer record */}
        <section className="rounded-3xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{data.farmer.farmName ?? data.farmer.name}</p>
            <span className="text-xs text-muted-foreground">since {formatDate(data.farmer.memberSince)}</span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Reliability</span>
              <span className="tabular font-semibold text-foreground">{Math.round(data.farmer.reliability * 100)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn("h-full rounded-full", data.farmer.reliability >= 0.85 ? "bg-lime" : data.farmer.reliability >= 0.75 ? "bg-warning" : "bg-tomato")}
                initial={{ width: 0 }}
                animate={{ width: `${data.farmer.reliability * 100}%` }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat k="Approved" v={data.farmer.history.approved} />
            <Stat k="Delivered" v={data.farmer.history.delivered} />
            <Stat k="Complaints" v={data.farmer.history.complaints} warn={data.farmer.history.complaints >= 3} />
          </dl>
          {data.farmer.recent.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {data.farmer.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    {cropName(r.crop)} <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                  </span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Audit trail */}
      <section className="mt-5 rounded-3xl border bg-card p-5">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4" /> Audit trail
        </p>
        <ol className="mt-3 space-y-2 border-l pl-4 text-sm">
          {data.trail.length === 0 && <li className="text-muted-foreground">Submitted, no decisions yet.</li>}
          {data.trail.map((t) => (
            <li key={t.id} className="relative">
              <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-foreground" />
              <span className="font-medium">{ACTION_LABEL[t.action] ?? t.action}</span> · {t.actor}
              <span className="ml-1 text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</span>
            </li>
          ))}
        </ol>
      </section>

      {pending && (
        <div className="glass sticky bottom-0 z-30 -mx-4 mt-6 border-y px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 lg:bottom-4 lg:mx-0 lg:rounded-2xl lg:border lg:pb-3">
          <div className="flex gap-2">
            <Button variant="destructive" size="lg" className="shrink-0 px-3.5 sm:px-6" onClick={() => setDecision("REJECT")} aria-label="Reject">
              <X /> <span className="hidden sm:inline">Reject</span>
            </Button>
            <Button variant="outline" size="lg" className="min-w-0 flex-1 px-3 sm:px-6" onClick={() => setDecision("RESUBMIT")}>
              <RotateCcw /> <span className="hidden sm:inline">Request changes</span>
              <span className="sm:hidden">Changes</span>
            </Button>
            <Button variant="brand" size="lg" className="min-w-0 flex-[1.3] px-3 sm:px-6" onClick={() => setDecision("APPROVE")}>
              <Check /> Approve
            </Button>
          </div>
        </div>
      )}

      <DecisionDialog
        key={decision ?? "closed"}
        kind={decision}
        onClose={() => setDecision(null)}
        defaults={{ price: data.proposedPrice, grade: data.grade, unit: data.unit }}
        onConfirm={(input) => decide(decision!, input)}
      />
    </div>
  );
}

function Fact({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={cn("tabular mt-0.5 font-semibold", warn && "text-tomato")}>{v}</dd>
    </div>
  );
}

function Stat({ k, v, warn }: { k: string; v: number; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl bg-muted/60 py-2", warn && "bg-tomato/12")}>
      <dd className="tabular text-xl font-semibold">{v}</dd>
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-9 w-1/2" />
      <div className="grid gap-5">
        <SkeletonBlock className="aspect-[4/3] w-full rounded-3xl" />
        <SkeletonBlock className="h-64 w-full rounded-3xl" />
      </div>
    </div>
  );
}
