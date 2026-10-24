// Admin review queue (left pane on desktop, full screen on phones):
// filter chips, FIFO cards with score, duplicate flag and wait time.
"use client";

import { AlertTriangle, Inbox } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { MediaImage } from "@/components/common/media-image";
import { useLive } from "@/hooks/use-live";
import type { SerializedBatch } from "@/lib/batches";
import { CROPS, cropName, isCropSlug } from "@/lib/crops";
import { formatQty, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type QueueItem = SerializedBatch & {
  farmer: { id: string; name: string; area: string | null; village: string | null; farmName: string | null; reliability: number };
  duplicateCount: number;
};

const FILTERS = [
  { key: "PENDING_REVIEW", label: "Pending" },
  { key: "RESUBMIT", label: "Needs changes" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
] as const;

/** SWR key for a queue filter (shared with the detail view for refreshes). */
export const queueKey = (status: string) => `/api/admin/batches?status=${status}`;

/** The queue list. */
export function ReviewList() {
  const pathname = usePathname();
  const [filter, setFilter] = useState<string>("PENDING_REVIEW");
  const { data, error, isLoading, mutate } = useSWR<QueueItem[]>(queueKey(filter));
  useLive(["batch.updated"], () => mutate());

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <LayoutGroup id="queue-filter">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn("relative h-10 rounded-full px-4 text-sm font-medium", filter === f.key ? "text-background" : "border text-muted-foreground")}
            >
              {filter === f.key && <motion.span layoutId="queue-filter-pill" className="absolute inset-0 -z-10 rounded-full bg-foreground" />}
              {f.label}
            </button>
          ))}
        </LayoutGroup>
      </div>
      {isLoading && <SkeletonRows count={5} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data?.length === 0 && <EmptyState icon={Inbox} title="Queue is clear" body="New harvests appear here the moment farmers submit them." />}
      <ul className="space-y-2.5">
        {data?.map((b, i) => {
          const active = pathname === `/admin/review/${b.id}`;
          const thumb = b.media.find((m) => m.type === "IMAGE")?.url ?? (isCropSlug(b.crop) ? CROPS[b.crop].image : null);
          return (
            <motion.li key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
              <Link
                href={`/admin/review/${b.id}`}
                className={cn(
                  "flex gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-foreground/30",
                  active && "border-foreground ring-2 ring-lime/50",
                )}
              >
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">{thumb && <MediaImage src={thumb} sizes="64px" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{cropName(b.crop)}</p>
                    {b.aiQualityScore !== null && (
                      <span
                        className={cn(
                          "tabular rounded-lg px-2 py-0.5 text-xs font-semibold",
                          b.aiQualityScore >= 85 ? "bg-lime/40" : b.aiQualityScore >= 70 ? "bg-warning/25" : "bg-tomato/20",
                        )}
                      >
                        {b.aiQualityScore}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {b.farmer.name} · {b.farmer.village ?? b.farmer.area}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatQty(b.quantity, b.unit)}</span>
                    <span>·</span>
                    <span>{timeAgo(b.createdAt)}</span>
                    {b.duplicateCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/25 px-2 py-0.5 font-medium text-foreground">
                        <AlertTriangle className="size-3" /> Duplicate flag
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
