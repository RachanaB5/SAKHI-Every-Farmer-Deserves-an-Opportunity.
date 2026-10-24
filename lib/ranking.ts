// Bulk offer ranking — deterministic weighted scoring (also the AI
// fallback). Each offer is scored 0–100 on:
//   delivered cost/kg 30% · quantity coverage 20% · ETA vs deadline 15% ·
//   visual quality 15% · distance 10% · farmer reliability 10%
// and gets a one-line reason naming what decided it. Cost is scored as a
// ratio to the cheapest delivered price (so a ₹2 gap is a small nudge, not
// a 30-point swing), and an offer that can't meet the deadline loses 40%
// of its score outright. Pure + unit-tested.
import { courierCost } from "@/lib/fees";

export const RANK_WEIGHTS = { cost: 0.3, coverage: 0.2, eta: 0.15, quality: 0.15, distance: 0.1, reliability: 0.1 } as const;
type Factor = keyof typeof RANK_WEIGHTS;

export interface RankInputOffer {
  id: string;
  farmerName: string;
  qtyKg: number;
  pricePerKg: number;
  etaHours: number;
  distanceKm: number;
  qualityScore: number | null;
  grade: string | null;
  reliability: number;
}

export interface RankInputDemand {
  qtyKg: number;
  grade: string;
  deadline: Date;
  now?: Date;
}

export interface RankedOffer {
  offerId: string;
  score: number;
  reason: string;
  factors: Record<Factor, number>;
  deliveredPerKg: number;
}

/** 1 when the offer comfortably beats the deadline, 0 when it misses it. */
function etaFit(etaHours: number, hoursLeft: number): number {
  if (hoursLeft <= 0) return 0;
  if (etaHours <= hoursLeft * 0.6) return 1;
  if (etaHours >= hoursLeft) return 0;
  return 1 - (etaHours - hoursLeft * 0.6) / (hoursLeft * 0.4);
}

/**
 * Scores and sorts offers for a demand (best first).
 * Ties break on delivered cost, then reliability.
 */
export function rankOffersDeterministic(demand: RankInputDemand, offers: RankInputOffer[]): RankedOffer[] {
  if (!offers.length) return [];
  const now = demand.now ?? new Date();
  const hoursLeft = (demand.deadline.getTime() - now.getTime()) / 3_600_000;
  const delivered = offers.map((o) => o.pricePerKg + courierCost(o.distanceKm) / Math.max(1, o.qtyKg));
  const lo = Math.min(...delivered);

  const scored = offers.map((o, i) => {
    const gradeBonus = demand.grade === "A" && o.grade === "A" ? 0.1 : demand.grade === "A" && o.grade && o.grade !== "A" ? -0.15 : 0;
    const factors: Record<Factor, number> = {
      cost: lo / delivered[i],
      coverage: Math.min(1, o.qtyKg / demand.qtyKg),
      eta: etaFit(o.etaHours, hoursLeft),
      quality: Math.max(0, Math.min(1, (o.qualityScore ?? 70) / 100 + gradeBonus)),
      distance: 1 - Math.min(o.distanceKm, 60) / 60,
      reliability: Math.max(0, Math.min(1, o.reliability)),
    };
    let score = (Object.keys(RANK_WEIGHTS) as Factor[]).reduce((s, k) => s + RANK_WEIGHTS[k] * factors[k], 0);
    // Missing the deadline is close to disqualifying for a kitchen.
    if (factors.eta === 0) score *= 0.6;
    return { o, factors, score: Math.round(score * 1000) / 10, deliveredPerKg: Math.round(delivered[i] * 100) / 100 };
  });

  scored.sort((a, b) => b.score - a.score || a.deliveredPerKg - b.deliveredPerKg || b.o.reliability - a.o.reliability);
  const best = scored[0];

  return scored.map((s, rank) => ({
    offerId: s.o.id,
    score: s.score,
    factors: s.factors,
    deliveredPerKg: s.deliveredPerKg,
    reason: reasonFor(s, rank, best, demand, Math.round(lo * 100) / 100),
  }));
}

type Scored = { o: RankInputOffer; factors: Record<Factor, number>; score: number; deliveredPerKg: number };

/** Plain-language reason: what the top offer wins on / what holds others back. */
function reasonFor(s: Scored, rank: number, best: Scored, demand: RankInputDemand, cheapest: number): string {
  const phrase: Record<Factor, (good: boolean) => string> = {
    cost: (g) =>
      g && s.deliveredPerKg <= cheapest ? `₹${s.deliveredPerKg}/kg delivered, the best price` : g ? `₹${s.deliveredPerKg}/kg delivered` : `costs ₹${s.deliveredPerKg}/kg delivered`,
    coverage: (g) => (g ? `covers all ${demand.qtyKg} kg` : `only covers ${Math.round(s.factors.coverage * 100)}% of the ${demand.qtyKg} kg`),
    eta: (g) => (g ? `arrives in ~${s.o.etaHours} h, well before the deadline` : s.factors.eta === 0 ? "would miss the deadline" : `tight for the deadline (~${s.o.etaHours} h)`),
    quality: (g) => (g ? `strong visual score${s.o.qualityScore ? ` (${s.o.qualityScore})` : ""}${s.o.grade ? `, grade ${s.o.grade}` : ""}` : `weaker visual evidence${s.o.qualityScore ? ` (${s.o.qualityScore})` : ""}`),
    distance: (g) => (g ? `closest farm (${Math.round(s.o.distanceKm)} km)` : `${Math.round(s.o.distanceKm)} km away`),
    reliability: (g) => (g ? `${Math.round(s.o.reliability * 100)}% reliable` : `lower reliability (${Math.round(s.o.reliability * 100)}%)`),
  };
  const factors = Object.keys(RANK_WEIGHTS) as Factor[];
  const contrib = factors.map((k) => ({ k, v: RANK_WEIGHTS[k] * s.factors[k], raw: s.factors[k] }));
  if (rank === 0) {
    const top = [...contrib].sort((a, b) => b.v - a.v).slice(0, 2);
    const text = top.map((t) => phrase[t.k](true)).join(" and ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  // For runners-up, name the factor where they lose most against the leader.
  const gap = factors.map((k) => ({ k, d: RANK_WEIGHTS[k] * (best.factors[k] - s.factors[k]) })).sort((a, b) => b.d - a.d)[0];
  const strength = [...contrib].sort((a, b) => b.v - a.v)[0];
  const text = strength.k !== gap.k ? `${phrase[strength.k](true)}, but ${phrase[gap.k](false)}` : phrase[gap.k](false);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
