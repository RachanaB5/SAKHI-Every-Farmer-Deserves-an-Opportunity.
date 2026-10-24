// Price advisor maths (farmer listing form). Numbers come from the DB —
// mandi reference prices, 7-day trend and comparable FoodFlow listings —
// never from a model. The AI layer only rewords the explanation.
import "server-only";
import { MANDI_FOR_AREA, MANDIS } from "@/lib/areas";
import { CROPS, isCropSlug } from "@/lib/crops";
import { db } from "@/lib/db";
import { round2 } from "@/lib/fees";

/** Farm-to-table retail sits above wholesale modal, below street retail (~1.4×). */
export const RETAIL_MARKUP = 1.15;
const GRADE_FACTOR: Record<string, number> = { A: 1.06, B: 1, C: 0.9, ANY: 1 };

export interface PriceAdvice {
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
  /** Last 14 days of local modal prices for the sparkline. */
  history: { date: string; modal: number }[];
  basis: string[];
  /** Plain facts handed to the model for rewording. */
  facts: string;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/**
 * Computes an indicative retail price.
 * @param crop - crop slug
 * @param area - service area (picks the reference mandi)
 * @param grade - A | B | C | ANY
 * @returns null when there is no market data for the crop
 */
export async function computePriceAdvice(crop: string, area: string | null, grade: string = "ANY"): Promise<PriceAdvice | null> {
  if (!isCropSlug(crop)) return null;
  const info = CROPS[crop];
  const mandi = (area && MANDI_FOR_AREA[area]) || MANDIS[0];
  const since = new Date(Date.now() - 15 * 86_400_000);
  const rows = await db.marketPrice.findMany({ where: { crop, date: { gte: since } }, orderBy: { date: "asc" } });
  if (!rows.length) return null;
  const local = rows.filter((r) => r.area === mandi);
  const series = local.length ? local : rows;

  const latest = series[series.length - 1];
  const last7 = series.slice(-7).map((r) => r.modalPrice);
  const prev7 = series.slice(-14, -7).map((r) => r.modalPrice);
  const trendPct = prev7.length ? round2(((mean(last7) - mean(prev7)) / mean(prev7)) * 100) : 0;
  const trend = trendPct > 3 ? "rising" : trendPct < -3 ? "falling" : "stable";

  const comparable = await db.listing.findMany({
    where: { crop, status: "ACTIVE", ...(area ? { area } : {}) },
    select: { pricePerUnit: true },
  });
  const compPrices = comparable.map((c) => c.pricePerUnit);
  const comparableMedian = compPrices.length ? round2(median(compPrices)) : null;

  const gradeFactor = GRADE_FACTOR[grade] ?? 1;
  const base = latest.modalPrice * RETAIL_MARKUP * gradeFactor;
  // Blend market-derived price with what similar listings actually charge,
  // then lean slightly into the weekly trend.
  let suggested = comparableMedian ? 0.7 * base + 0.3 * comparableMedian : base;
  suggested *= 1 + (trendPct / 100) * 0.3;
  const min = Math.round(latest.minPrice * RETAIL_MARKUP);
  const max = Math.round(latest.maxPrice * RETAIL_MARKUP);
  suggested = Math.round(Math.min(max, Math.max(min, suggested)));

  const unitLabel = info.unit;
  const basis = [
    `${mandi} modal price today is ₹${round2(latest.modalPrice)}/${unitLabel} (7-day average ₹${round2(mean(last7))}).`,
    trend === "stable"
      ? "Prices have been steady this week."
      : `Prices are ${trend} ${Math.abs(trendPct)}% week on week.`,
    comparableMedian
      ? `${compPrices.length} similar FoodFlow listing${compPrices.length > 1 ? "s" : ""}${area ? ` in ${area}` : ""} sell at a median ₹${comparableMedian}/${unitLabel}.`
      : `No other FoodFlow listings for ${info.names.en.toLowerCase()} right now, you set the pace.`,
    grade !== "ANY" && gradeFactor !== 1
      ? `Grade ${grade} ${gradeFactor > 1 ? "adds" : "removes"} about ${Math.round(Math.abs(gradeFactor - 1) * 100)}%.`
      : "Direct-to-buyer pricing sits about 15% above wholesale, still below street retail.",
  ];
  const facts = [
    `Crop: ${info.names.en}, unit: ${unitLabel}, grade: ${grade}`,
    `Reference mandi: ${mandi}; modal today ₹${round2(latest.modalPrice)}; range ₹${latest.minPrice}–₹${latest.maxPrice}`,
    `Week-on-week trend: ${trendPct}% (${trend})`,
    `Comparable FoodFlow listings: ${compPrices.length}, median ₹${comparableMedian ?? "n/a"}`,
    `Suggested retail price: ₹${suggested} (range ₹${min}–₹${max})`,
  ].join("\n");

  return {
    crop,
    unit: unitLabel,
    mandi,
    suggested,
    min,
    max,
    trend,
    trendPct,
    modalToday: round2(latest.modalPrice),
    comparableMedian,
    comparableCount: compPrices.length,
    history: series.slice(-14).map((r) => ({ date: r.date.toISOString().slice(0, 10), modal: r.modalPrice })),
    basis,
    facts,
  };
}
