// Farmer home: one calm photo grid of everything the farmer has added
// (newest first) and a large + button to add more. Each card shows the crop,
// how much, the price and where it stands — in the farmer's own language —
// and can be deleted from the photo's corner.
"use client";

import { AlertCircle, CheckCircle2, Clock, PackageCheck, Pause, PencilLine, Plus, Sprout, X, XCircle, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import useSWR from "swr";
import { ErrorState, SkeletonCards } from "@/components/common/states";
import { CARD, CARD_GRID, CropPhoto, PHOTO_CHIP, PhotoDeleteButton, coverOf } from "@/components/farmer/crop-photo";
import { statusText } from "@/components/farmer/farmer-status-badge";
import { useRemoveHarvest } from "@/components/farmer/remove-harvest";
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
  const removal = useRemoveHarvest(() => mutate());
  const q = query.trim();
  const rows = data?.filter((b) => !q || matches(b, q, statusText(t, b.listing?.status ?? b.status))) ?? [];

  return (
    <div>
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

      {isLoading && <SkeletonCards count={8} className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data?.length === 0 && <EmptyHome />}
      {data && data.length > 0 && rows.length === 0 && (
        <p className="rounded-3xl border border-dashed p-8 text-center text-muted-foreground">{t("home.noResults", { q })}</p>
      )}

      <ul className={CARD_GRID}>
        {rows.map((b, i) => (
          <HarvestCard key={b.id} row={b} index={i} removeLabel={removal.label(b)} removing={removal.busyId === b.id} onRemove={() => removal.ask(b)} />
        ))}
      </ul>
      {removal.dialog}

      {data?.length !== 0 && <AddButton />}
    </div>
  );
}

function HarvestCard({ row, index, removeLabel, removing, onRemove }: { row: Row; index: number; removeLabel: string; removing: boolean; onRemove: () => void }) {
  const { t, lang } = useI18n();
  const status = row.listing?.status ?? row.status;
  const state = STATE[status] ?? STATE.DRAFT;
  const Icon = state.icon;
  const price = row.listing?.pricePerUnit ?? row.proposedPrice;
  const action = row.status === "RESUBMIT" ? t("batches.fix") : row.status === "DRAFT" ? t("batches.continue") : null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.035, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className={CARD}
    >
      <Link href={hrefFor(row)} className="flex flex-1 flex-col active:scale-[0.99]">
        <CropPhoto crop={row.crop} src={coverOf(row.media)}>
          <span className={cn(PHOTO_CHIP, "absolute bottom-2 left-2 max-w-[calc(100%-1rem)]")}>
            <span className={cn("inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-sm font-medium", state.tone)}>
              <Icon className="size-4 shrink-0" /> <span className="truncate">{statusText(t, status)}</span>
            </span>
          </span>
        </CropPhoto>
        <div className="flex flex-1 flex-col p-3 sm:p-4">
          <p className="text-lg leading-tight font-semibold break-words">{cropName(row.crop, lang)}</p>
          <p className="tabular mt-1 text-[15px]">
            {formatQty(row.quantity, row.unit, lang)}
            {price ? (
              <>
                {" · "}
                <b>{formatINR(price)}</b>/{unitName(row.unit, lang)}
              </>
            ) : null}
          </p>
          {row.listing?.status === "ACTIVE" && (
            <p className="mt-0.5 text-sm text-muted-foreground">{t("home.left", { qty: formatQty(row.listing.availableQty, row.unit, lang) })}</p>
          )}
          <div className="mt-auto pt-2">
            {action && <p className="text-sm font-semibold underline underline-offset-4">{action}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{t("home.added", { when: timeAgo(row.createdAt, lang) })}</p>
          </div>
        </div>
      </Link>
      <PhotoDeleteButton label={removeLabel} busy={removing} onClick={onRemove} />
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
