// Farmer home: one calm list of everything the farmer has added (newest
// first) and a large + button to add more. Each row shows the crop, how
// much, the price and where it stands — in the farmer's own language.
"use client";

import { AlertCircle, CheckCircle2, ChevronRight, Clock, PackageCheck, Pause, PencilLine, Plus, Sprout, X, XCircle, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import useSWR from "swr";
import { MediaImage } from "@/components/common/media-image";
import { ErrorState, SkeletonRows } from "@/components/common/states";
import { statusText } from "@/components/farmer/farmer-status-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { useLive } from "@/hooks/use-live";
import type { SerializedBatch } from "@/lib/batches";
import { CROPS, cropName, isCropSlug } from "@/lib/crops";
import { formatINR, formatQty, timeAgo, unitName } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = SerializedBatch & { listing: { id: string; status: string; availableQty: number; pricePerUnit: number } | null };

const WARNING = "bg-warning/18 text-[color-mix(in_oklch,var(--warning),black_35%)] dark:text-warning";

/** Icon + colour per status, so the state reads without reading the word. */
const STATE: Record<string, { icon: LucideIcon; tone: string }> = {
  ACTIVE: { icon: CheckCircle2, tone: "bg-success/14 text-success" },
  APPROVED: { icon: CheckCircle2, tone: "bg-success/14 text-success" },
  PAUSED: { icon: Pause, tone: "bg-muted text-muted-foreground" },
  SOLD_OUT: { icon: PackageCheck, tone: "bg-muted text-muted-foreground" },
  PENDING_REVIEW: { icon: Clock, tone: WARNING },
  RESUBMIT: { icon: AlertCircle, tone: WARNING },
  REJECTED: { icon: XCircle, tone: "bg-destructive/12 text-destructive" },
  DRAFT: { icon: PencilLine, tone: "bg-muted text-muted-foreground" },
};

/** Drafts and sent-back batches reopen the wizard; live ones go to listings. */
function hrefFor(b: Row): string {
  if (b.status === "DRAFT" || b.status === "RESUBMIT") return `/farmer/batches/new?batch=${b.id}`;
  return b.listing ? "/farmer/listings" : "/farmer/batches";
}

/** True when the query names this crop in any language, or its status. */
function matches(b: Row, q: string, status: string): boolean {
  const needle = q.toLowerCase();
  const info = isCropSlug(b.crop) ? CROPS[b.crop] : null;
  const words = [b.crop, status, ...(info ? [...Object.values(info.names), ...info.aliases] : [])];
  return words.some((w) => w.toLowerCase().includes(needle));
}

/**
 * /farmer
 * @param query - search text from the top bar (`?q=`)
 */
export function FarmerHome({ query }: { query: string }) {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<Row[]>("/api/batches");
  useLive(["batch.updated", "inventory.updated", "order.updated"], () => mutate());
  const q = query.trim();
  const rows = data?.filter((b) => !q || matches(b, q, statusText(t, b.listing?.status ?? b.status))) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("home.title")}</h1>
        <p className="mt-1 text-base text-muted-foreground">{t("home.subtitle")}</p>
      </header>

      {q && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{t("home.results", { q })}</p>
          <Link href="/farmer" className="inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm hover:bg-muted">
            <X className="size-4" /> {t("home.clear")}
          </Link>
        </div>
      )}

      {isLoading && <SkeletonRows count={4} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data?.length === 0 && <EmptyHome />}
      {data && data.length > 0 && rows.length === 0 && (
        <p className="rounded-3xl border border-dashed p-8 text-center text-muted-foreground">{t("home.noResults", { q })}</p>
      )}

      <ul className="space-y-3">
        {rows.map((b, i) => (
          <HarvestRow key={b.id} row={b} index={i} />
        ))}
      </ul>

      {data?.length !== 0 && <AddButton />}
    </div>
  );
}

function HarvestRow({ row, index }: { row: Row; index: number }) {
  const { t, lang } = useI18n();
  const status = row.listing?.status ?? row.status;
  const state = STATE[status] ?? STATE.DRAFT;
  const Icon = state.icon;
  const price = row.listing?.pricePerUnit ?? row.proposedPrice;
  const thumb = row.media.find((m) => m.type === "IMAGE")?.url ?? (isCropSlug(row.crop) ? CROPS[row.crop].image : null);
  const action = row.status === "RESUBMIT" ? t("batches.fix") : row.status === "DRAFT" ? t("batches.continue") : null;

  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
      <Link
        href={hrefFor(row)}
        className="flex items-center gap-4 rounded-3xl border bg-card p-3 transition-colors hover:border-foreground/30 active:scale-[0.99] sm:p-4"
      >
        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted">{thumb && <MediaImage src={thumb} sizes="80px" />}</div>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-semibold">{cropName(row.crop, lang)}</p>
          <p className="tabular mt-0.5 text-[15px]">
            {formatQty(row.quantity, row.unit, lang)}
            {price ? (
              <>
                {" · "}
                <b>{formatINR(price)}</b>/{unitName(row.unit, lang)}
              </>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium", state.tone)}>
              <Icon className="size-4" /> {statusText(t, status)}
            </span>
            {row.listing?.status === "ACTIVE" && (
              <span className="text-sm text-muted-foreground">{t("home.left", { qty: formatQty(row.listing.availableQty, row.unit, lang) })}</span>
            )}
            {action && <span className="text-sm font-semibold underline underline-offset-4">{action}</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("home.added", { when: timeAgo(row.createdAt, lang) })}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    </motion.li>
  );
}

/** Floating add button: a big + on phones, + and a label on wider screens. */
function AddButton() {
  const { t } = useI18n();
  return (
    <Link
      href="/farmer/batches/new"
      aria-label={t("home.add")}
      className="fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 isolate flex h-[72px] min-w-[72px] items-center justify-center gap-2 rounded-full bg-lime text-lime-foreground shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] ring-4 ring-background transition-transform active:scale-95 sm:right-8 sm:bottom-8 sm:px-7"
    >
      <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-lime/60 motion-reduce:hidden" />
      <Plus className="size-9" strokeWidth={2.75} />
      <span className="hidden text-lg font-semibold sm:inline">{t("home.add")}</span>
    </Link>
  );
}

function EmptyHome() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed px-6 py-14 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-lime/30">
        <Sprout className="size-8" />
      </span>
      <p className="mt-4 text-xl font-semibold">{t("home.emptyTitle")}</p>
      <p className="mt-1 max-w-xs text-base text-muted-foreground">{t("home.emptyBody")}</p>
      <Link
        href="/farmer/batches/new"
        aria-label={t("home.add")}
        className="mt-6 grid size-20 place-items-center rounded-full bg-lime text-lime-foreground shadow-lg transition-transform active:scale-95"
      >
        <Plus className="size-10" strokeWidth={2.75} />
      </Link>
    </div>
  );
}
