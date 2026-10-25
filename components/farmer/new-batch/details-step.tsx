// Wizard step 1: what was harvested, how much, and when.
"use client";

import { CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { QtyStepper } from "@/components/common/qty-stepper";
import { useI18n } from "@/components/providers/i18n-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CROPS, type CropSlug, type Unit } from "@/lib/crops";
import { unitName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CropPicker } from "./crop-picker";
import { isoDaysAgo, type DraftFields } from "./types";

const UNITS: Unit[] = ["kg", "litre", "dozen"];

/**
 * @param fields - current draft values
 * @param set - partial updater
 * @param missing - field names to highlight (from validation or voice parsing)
 * @param voice - optional voice capture block rendered above the form
 * @param cropOrder - crops to show, farmer's own first
 */
export function DetailsStep({
  fields,
  set,
  missing,
  voice,
  cropOrder,
}: {
  fields: DraftFields;
  set: (patch: Partial<DraftFields>) => void;
  missing: string[];
  voice?: React.ReactNode;
  cropOrder?: CropSlug[];
}) {
  const { t, lang } = useI18n();
  const dateChips = [
    { label: t("time.today"), value: isoDaysAgo(0) },
    { label: t("time.yesterdayCap"), value: isoDaysAgo(1) },
    { label: t("time.twoDaysAgo"), value: isoDaysAgo(2) },
  ];
  const custom = fields.harvestDate && !dateChips.some((c) => c.value === fields.harvestDate);
  const flag = (k: string) => missing.includes(k);

  return (
    <div className="space-y-7">
      {voice}

      <section className={cn("space-y-3 rounded-3xl", flag("crop") && "ring-2 ring-tomato/60 ring-offset-4 ring-offset-background")}>
        <Label className="text-[15px]">{t("batch.crop")}</Label>
        <CropPicker
          crops={cropOrder}
          value={fields.crop}
          onChange={(crop: CropSlug) => set({ crop, unit: CROPS[crop].unit })}
        />
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="qty" className="text-[15px]">
            {t("batch.quantity")}
          </Label>
          <QtyStepper
            id="qty"
            size="lg"
            value={fields.quantity}
            onChange={(quantity) => set({ quantity })}
            step={fields.unit === "kg" ? 5 : 1}
            min={0}
            className={cn(flag("qty") && "rounded-xl ring-2 ring-tomato/60")}
          />
          <div role="radiogroup" aria-label={t("batch.unit")} className="flex gap-2">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={fields.unit === u}
                onClick={() => set({ unit: u })}
                className={cn(
                  "relative h-10 flex-1 rounded-xl border text-sm font-medium",
                  fields.unit === u ? "border-foreground text-foreground" : "text-muted-foreground",
                )}
              >
                {fields.unit === u && <motion.span layoutId="unit-pill" className="absolute inset-0 -z-10 rounded-xl bg-lime/30" />}
                {unitName(u, lang)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[15px]">{t("batch.harvestDate")}</Label>
          <div className={cn("grid grid-cols-3 gap-2", flag("harvestDate") && "rounded-xl ring-2 ring-tomato/60")}>
            {dateChips.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => set({ harvestDate: c.value })}
                className={cn(
                  "min-h-12 rounded-xl border px-2 text-sm font-medium transition-colors",
                  fields.harvestDate === c.value ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <label className={cn("flex items-center gap-2 rounded-xl border px-3", custom && "border-foreground")}>
            <CalendarDays className="size-4 text-muted-foreground" />
            <Input
              type="date"
              aria-label={t("batch.otherDate")}
              min={isoDaysAgo(10)}
              max={isoDaysAgo(0)}
              value={custom ? fields.harvestDate : ""}
              onChange={(e) => set({ harvestDate: e.target.value })}
              className="border-0 bg-transparent px-0 focus-visible:ring-0"
            />
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="notes" className="text-[15px]">
          {t("batch.notes")}
        </Label>
        <Textarea
          id="notes"
          rows={2}
          maxLength={400}
          placeholder={t("batch.notesPh")}
          value={fields.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </section>
    </div>
  );
}
