// Honesty labels for AI output: where a result came from (model vs offline
// estimate) and the mandatory disclaimers for quality and price advice.
// Labels follow the UI language (English outside the farmer interface).
"use client";

import { Cpu, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** "AI" or "Offline estimate" chip. */
export function AISourceBadge({ source, className }: { source: "ai" | "fallback" | string | null | undefined; className?: string }) {
  const { t } = useI18n();
  const ai = source === "ai";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium",
        ai ? "border-lime/60 bg-lime/15" : "text-muted-foreground",
        className,
      )}
      title={ai ? t("ai.aiTitle") : t("ai.offlineTitle")}
    >
      {ai ? <Sparkles className="size-3" /> : <Cpu className="size-3" />}
      {ai ? t("ai.ai") : t("ai.offline")}
    </span>
  );
}

/** Required label on every visual quality result. */
export function QualityDisclaimer({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <ShieldAlert className="mt-px size-3.5 shrink-0" />
      {t("batch.disclaimer")}
    </p>
  );
}

/** "Indicative" tag for price advice. */
export function IndicativeTag({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full bg-muted px-2 text-[11px] font-medium tracking-wide uppercase", className)}>
      {t("common.indicative")}
    </span>
  );
}

const FLAGS = ["bruising", "rot_spots", "mould", "mixed_sizes", "wilting", "minor_blemishes", "low_light", "blurry_photo", "overexposed", "not_produce", "not_detectable", "crop_mismatch", "crop_unconfirmed", "multiple_items", "stock_photo"];

/**
 * Human label for a quality flag code.
 * @param t - translator from useI18n (labels default to English)
 */
export function flagLabel(flag: string, t: (key: MessageKey) => string): string {
  return FLAGS.includes(flag) ? t(`flag.${flag}` as MessageKey) : flag.replace(/_/g, " ");
}
