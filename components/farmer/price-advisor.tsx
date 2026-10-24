// AI price advisor card (farmer listing form): suggested price, market
// range bar with markers, mandi trend sparkline and plain-language basis.
// Always labelled "Indicative" — the farmer sets the final price.
"use client";

import { TrendingDown, TrendingUp, Minus as Flat } from "lucide-react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import useSWR from "swr";
import { AISourceBadge, IndicativeTag } from "@/components/ai/ai-labels";
import { SkeletonBlock } from "@/components/common/states";
import { CountUp } from "@/components/motion/count-up";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/fetcher";
import { formatINR, unitName } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PriceAdviceData {
  crop: string;
  unit: string;
  mandi: string;
  suggested: number;
  min: number;
  max: number;
  trend: "rising" | "falling" | "stable";
  trendPct: number;
  modalToday: number;
  comparableMedian: number | null;
  comparableCount: number;
  history: { date: string; modal: number }[];
  basis: string[];
  source: "ai" | "fallback";
  label: string;
}

/** Keyed POST fetch so SWR caches per crop/grade. */
function postAdvice([url, crop, grade]: [string, string, string]) {
  return fetcher<PriceAdviceData>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ crop, grade }),
  });
}

/**
 * @param crop - crop slug
 * @param grade - visual grade if known (A/B/C) — shifts the suggestion
 * @param yourPrice - farmer's current price (plotted on the range bar)
 * @param onUse - apply the suggested price
 */
export function PriceAdvisor({
  crop,
  grade = "ANY",
  yourPrice,
  onUse,
}: {
  crop: string;
  grade?: string;
  yourPrice?: number;
  onUse?: (price: number) => void;
}) {
  const { t, lang } = useI18n();
  const { data, error, isLoading } = useSWR(["/api/ai/price-advice", crop, grade], postAdvice, { revalidateOnFocus: false });

  if (isLoading) return <SkeletonBlock className="h-80 w-full rounded-3xl" />;
  if (error || !data) {
    return <p className="rounded-3xl border p-4 text-sm text-muted-foreground">{t("advisor.unavailable")}</p>;
  }

  const span = Math.max(1, data.max - data.min);
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - data.min) / span) * 100))}%`;
  const TrendIcon = data.trend === "rising" ? TrendingUp : data.trend === "falling" ? TrendingDown : Flat;
  const unit = unitName(data.unit, lang);
  // Model-written sentences arrive in the farmer's language; the offline basis is English,
  // so other languages rebuild the same facts from the numbers.
  const basis =
    lang === "en" || data.source === "ai"
      ? data.basis
      : [
          t("advisor.basisModal", { mandi: data.mandi, price: data.modalToday, unit }),
          data.trend === "stable"
            ? t("advisor.basisSteady")
            : t(data.trend === "rising" ? "advisor.basisRising" : "advisor.basisFalling", { pct: Math.abs(data.trendPct) }),
          data.comparableMedian
            ? t("advisor.basisComparable", { count: data.comparableCount, price: data.comparableMedian, unit })
            : t("advisor.basisNone"),
        ];

  return (
    <div className="overflow-hidden rounded-3xl border bg-card">
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t("batch.suggested")}</p>
          <IndicativeTag />
          <AISourceBadge source={data.source} />
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <p className="text-5xl font-semibold tracking-tight">
            <CountUp value={data.suggested} format={(n) => formatINR(n)} />
            <span className="ml-1 text-lg font-normal text-muted-foreground">/{unit}</span>
          </p>
          {onUse && (
            <Button type="button" variant="brand" onClick={() => onUse(data.suggested)}>
              {t("advisor.use", { price: formatINR(data.suggested) })}
            </Button>
          )}
        </div>

        {/* Market range with suggested (lime) and your price (ink) markers */}
        <div className="mt-6">
          <div className="relative h-2.5 rounded-full bg-gradient-to-r from-tomato/40 via-warning/50 to-lime/70">
            <Marker left={pos(data.suggested)} className="bg-lime ring-lime/40" />
            {yourPrice ? <Marker left={pos(yourPrice)} className="bg-foreground ring-foreground/25" /> : null}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{formatINR(data.min)}</span>
            <span>{t("batch.range")}</span>
            <span>{formatINR(data.max)}</span>
          </div>
          {yourPrice ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="mr-1 inline-block size-2 rounded-full bg-foreground" /> {t("advisor.you", { price: formatINR(yourPrice) })}
              {yourPrice > data.max ? `, ${t("advisor.above")}` : yourPrice < data.min ? `, ${t("advisor.below")}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 border-t bg-muted/30 p-5 sm:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <TrendIcon className={cn("size-4", data.trend === "rising" ? "text-success" : data.trend === "falling" ? "text-tomato" : "")} />
            {data.trend === "stable" ? t("advisor.steady") : t("advisor.wow", { pct: `${data.trend === "rising" ? "+" : ""}${data.trendPct}%` })}
          </p>
          <p className="text-xs text-muted-foreground">{t("advisor.modal", { mandi: data.mandi, price: data.modalToday })}</p>
          <div className="mt-2 h-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.history} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--lime)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--lime)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip
                  cursor={false}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 12 }}
                  formatter={(v) => [`₹${v}`, t("advisor.modalShort")]}
                  labelFormatter={(_, p) => (p?.[0]?.payload as { date?: string } | undefined)?.date ?? ""}
                />
                <Area type="monotone" dataKey="modal" stroke="var(--chart-1)" strokeWidth={2} fill="url(#spark)" isAnimationActive />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {basis.map((b, i) => (
            <motion.li
              key={b}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              className="flex gap-2"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/50" />
              <span>{b}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Marker({ left, className }: { left: string; className: string }) {
  return (
    <motion.span
      className={cn("absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ring-4", className)}
      initial={false}
      animate={{ left }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
    />
  );
}
