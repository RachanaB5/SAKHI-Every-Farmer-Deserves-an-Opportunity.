// Wizard step 4: everything at a glance before sending for verification.
"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useI18n } from "@/components/providers/i18n-provider";
import { CROPS, cropName } from "@/lib/crops";
import { formatDate, formatINR, formatQty, unitName } from "@/lib/format";
import type { DraftFields, UploadTile } from "./types";

/**
 * @param quality - optional visual-check summary block
 */
export function ReviewStep({
  fields,
  tiles,
  quality,
}: {
  fields: DraftFields;
  tiles: UploadTile[];
  quality?: React.ReactNode;
}) {
  const { t, lang } = useI18n();
  if (!fields.crop) return null;
  const qty = Number(fields.quantity) || 0;
  const price = Number(fields.price) || 0;
  const done = tiles.filter((x) => x.status === "done");
  const dups = done.filter((x) => x.media?.isDuplicate).length;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border bg-card">
        <div className="relative h-36 sm:h-44">
          <Image src={CROPS[fields.crop].image} alt="" fill sizes="(max-width: 768px) 100vw, 720px" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
          <div className="absolute inset-x-5 bottom-4 text-white">
            <p className="text-2xl font-semibold">{cropName(fields.crop, lang)}</p>
            <p className="text-sm opacity-85">
              {formatQty(qty, fields.unit, lang)} · {formatDate(`${fields.harvestDate}T12:00:00`, lang)}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-y border-t text-sm sm:grid-cols-3 sm:divide-y-0">
          <Fact label={t("batch.price")} value={`${formatINR(price)} / ${unitName(fields.unit, lang)}`} />
          <Fact label={t("batch.potentialGross")} value={formatINR(qty * price)} />
          <Fact label={t("batch.stepMedia")} value={done.length === 1 ? t("batch.oneFile") : t("batch.files", { n: done.length })} />
        </dl>
        {fields.notes && <p className="border-t px-5 py-3 text-sm text-muted-foreground">“{fields.notes}”</p>}
      </div>

      {quality}

      {dups > 0 && (
        <p className="flex gap-2 rounded-2xl bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> {t("batch.duplicateWarn")}
        </p>
      )}
      <p className="flex gap-2 rounded-2xl bg-muted/60 p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        {t("batch.adminChecks")}
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
