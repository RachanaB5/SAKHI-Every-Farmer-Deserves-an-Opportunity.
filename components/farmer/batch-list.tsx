// Farmer "Harvests" grid: every batch as a photo card with its verification
// status, the visual score, admin notes, a way back into drafts /
// resubmissions, and delete (or, once live, remove the listing).
"use client";

import { ArrowUpRight, Sprout } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import useSWR from "swr";
import { EmptyState, ErrorState, SkeletonCards } from "@/components/common/states";
import { CARD, CARD_GRID, CropPhoto, PHOTO_CHIP, PhotoDeleteButton, coverOf } from "@/components/farmer/crop-photo";
import { FarmerStatusBadge } from "@/components/farmer/farmer-status-badge";
import { useRemoveHarvest } from "@/components/farmer/remove-harvest";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import type { SerializedBatch } from "@/lib/batches";
import { cropName } from "@/lib/crops";
import { formatQty, timeAgo, unitName } from "@/lib/format";
import { useLive } from "@/hooks/use-live";

type Row = SerializedBatch & { listing: { id: string; status: string } | null };

/** Client grid backed by /api/batches with live status updates. */
export function BatchList() {
  const { t, lang } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<Row[]>("/api/batches");
  useLive(["batch.updated"], () => mutate());
  const removal = useRemoveHarvest(() => mutate());

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
      {isLoading && <SkeletonCards count={8} className="grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data && data.length === 0 && (
        <EmptyState icon={Sprout} title={t("common.empty")} body={t("batches.emptyBody")} />
      )}
      <ul className={CARD_GRID}>
        {data?.map((b, i) => {
          const editable = b.status === "DRAFT" || b.status === "RESUBMIT";
          return (
            <motion.li
              key={b.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className={CARD}
            >
              <CropPhoto crop={b.crop} src={coverOf(b.media)}>
                <div className="absolute right-14 bottom-2 left-2 flex flex-wrap gap-1">
                  <span className={PHOTO_CHIP}>
                    <FarmerStatusBadge status={b.status} pulse={b.status === "PENDING_REVIEW"} />
                  </span>
                  {b.media.some((m) => m.isDuplicate) && (
                    <span className={PHOTO_CHIP}>
                      <FarmerStatusBadge status="FLAG" label={t("batch.duplicateFlag")} className="bg-warning/20" />
                    </span>
                  )}
                </div>
                <PhotoDeleteButton label={removal.label(b)} busy={removal.busyId === b.id} onClick={() => removal.ask(b)} />
              </CropPhoto>
              <div className="flex flex-1 flex-col p-3 sm:p-4">
                <p className="text-lg leading-tight font-semibold break-words">{cropName(b.crop, lang)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatQty(b.quantity, b.unit, lang)}
                  {b.proposedPrice ? ` · ₹${b.proposedPrice}/${unitName(b.unit, lang)}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("home.added", { when: timeAgo(b.createdAt, lang) })}</p>
                {b.aiQualityScore !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("batches.visualScore", { score: b.aiQualityScore, grade: b.grade ?? "-" })}
                  </p>
                )}
                {b.adminNote && (b.status === "RESUBMIT" || b.status === "REJECTED") && (
                  <p className="mt-2 rounded-xl bg-muted/70 px-3 py-2 text-sm">{t("batches.adminNote", { note: b.adminNote })}</p>
                )}
                {(editable || b.listing) && (
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
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
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
      {removal.dialog}
    </div>
  );
}
