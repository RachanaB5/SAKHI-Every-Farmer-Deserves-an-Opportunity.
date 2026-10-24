// Offer-ranking fallback: weights, deadline handling, coverage and reasons.
import { describe, expect, it } from "vitest";
import { rankOffersDeterministic, type RankInputOffer } from "@/lib/ranking";

const now = new Date("2026-10-20T08:00:00+05:30");
const demand = { qtyKg: 50, grade: "ANY", deadline: new Date(now.getTime() + 48 * 3_600_000), now };
const base: RankInputOffer = { id: "x", farmerName: "F", qtyKg: 50, pricePerKg: 30, etaHours: 12, distanceKm: 10, qualityScore: 85, grade: "A", reliability: 0.9 };

describe("rankOffersDeterministic", () => {
  it("prefers the cheaper delivered price when all else is equal", () => {
    const r = rankOffersDeterministic(demand, [
      { ...base, id: "pricey", pricePerKg: 34 },
      { ...base, id: "cheap", pricePerKg: 28 },
    ]);
    expect(r[0].offerId).toBe("cheap");
    expect(r[0].reason).toMatch(/best price/);
  });

  it("penalises offers that would miss the deadline", () => {
    const r = rankOffersDeterministic(demand, [
      { ...base, id: "late", pricePerKg: 25, etaHours: 60 },
      { ...base, id: "ontime", pricePerKg: 29, etaHours: 10 },
    ]);
    expect(r[0].offerId).toBe("ontime");
    expect(r[1].factors.eta).toBe(0);
    expect(r[1].reason).toMatch(/miss the deadline/);
  });

  it("rewards full quantity coverage", () => {
    const r = rankOffersDeterministic(demand, [
      { ...base, id: "partial", qtyKg: 20, pricePerKg: 29 },
      { ...base, id: "full", qtyKg: 50, pricePerKg: 30 },
    ]);
    expect(r[0].offerId).toBe("full");
    expect(r[1].reason).toMatch(/only covers 40%/);
  });

  it("includes courier cost spread over the quantity in the delivered price", () => {
    const [far, near] = [
      { ...base, id: "far", distanceKm: 60, qtyKg: 10 },
      { ...base, id: "near", distanceKm: 2, qtyKg: 10 },
    ];
    const r = rankOffersDeterministic({ ...demand, qtyKg: 10 }, [far, near]);
    expect(r.find((o) => o.offerId === "far")!.deliveredPerKg).toBeGreaterThan(r.find((o) => o.offerId === "near")!.deliveredPerKg);
    expect(r[0].offerId).toBe("near");
  });

  it("returns scores within 0–100 and stays deterministic", () => {
    const offers = [base, { ...base, id: "y", reliability: 0.6, qualityScore: null, grade: null }];
    const a = rankOffersDeterministic(demand, offers);
    const b = rankOffersDeterministic(demand, offers);
    expect(a).toEqual(b);
    for (const o of a) {
      expect(o.score).toBeGreaterThanOrEqual(0);
      expect(o.score).toBeLessThanOrEqual(100);
    }
  });

  it("handles an empty offer list", () => {
    expect(rankOffersDeterministic(demand, [])).toEqual([]);
  });
});
