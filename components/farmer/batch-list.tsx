// Farmer "Harvests" list: every batch with its verification status, the
// visual score, admin notes, and a way back into drafts / resubmissions.
"use client";

import { ArrowUpRight, Sprout } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { FarmerStatusBadge } from "@/components/farmer/farmer-status-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import type { SerializedBatch } from "@/lib/batches";
import { CROPS, cropName, isCropSlug } from "@/lib/crops";
import { formatQty, timeAgo, unitName } from "@/lib/format";
import { useLive } from "@/hooks/use-live";

type Row = SerializedBatch & { listing: { id: string; status: string } | null };

/** Client list backed by /api/batches with live status updates. */
export function BatchList() {
  const { t, lang } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<Row[]>("/api/batches");
  useLive(["batch.updated"], () => mutate());

  return (
    <div>
      <PageHeader
        title={t("nav.batches")}
        description={t("batches.desc")}
        actions={
          <Button asChild variant="brand">
            <Link href="/farmer/batches/new">{t("dash.newHarvest")}</Link>
          </Button>
        }
      />
      {isLoading && <SkeletonRows count={4} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data && data.length === 0 && (
        <EmptyState icon={Sprout} title={t("common.empty")} body={t("batches.emptyBody")} />
      )}
      <ul className="space-y-3">
        {data?.map((b, i) => {
          const thumb = b.media.find((m) => m.type === "IMAGE")?.url ?? (isCropSlug(b.crop) ? CROPS[b.crop].image : null);
          const editable = b.status === "DRAFT" || b.status === "RESUBMIT";
          return (
            <motion.li
              key={b.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
              className="flex gap-3 rounded-3xl border bg-card p-3 sm:p-4"
            >
              <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-24">
                {thumb &&
                  (thumb.startsWith("data:") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- inline-stored upload
                    <img src={thumb} alt="" className="size-full object-cover" />
                  ) : (
                    <Image src={thumb} alt="" fill sizes="96px" className="object-cover" />
                  ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{cropName(b.crop, lang)}</p>
                  <FarmerStatusBadge status={b.status} pulse={b.status === "PENDING_REVIEW"} />
                  {b.media.some((m) => m.isDuplicate) && <FarmerStatusBadge status="FLAG" label={t("batch.duplicateFlag")} className="bg-warning/20" />}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatQty(b.quantity, b.unit, lang)}
                  {b.proposedPrice ? ` · ₹${b.proposedPrice}/${unitName(b.unit, lang)}` : ""} · {timeAgo(b.createdAt, lang)}
                </p>
                {b.aiQualityScore !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("batches.visualScore", { score: b.aiQualityScore, grade: b.grade ?? "-" })}
                  </p>
                )}
                {b.adminNote && (b.status === "RESUBMIT" || b.status === "REJECTED") && (
                  <p className="mt-2 rounded-xl bg-muted/70 px-3 py-2 text-sm">{t("batches.adminNote", { note: b.adminNote })}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {editable && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/farmer/batches/new?batch=${b.id}`}>
                        {b.status === "RESUBMIT" ? t("batches.fix") : t("batches.continue")} <ArrowUpRight />
                      </Link>
                    </Button>
                  )}
                  {b.listing && (
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/farmer/listings">
                        {t("batches.viewListing")} <ArrowUpRight />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
