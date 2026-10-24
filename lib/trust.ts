// Trust & safety signals for admins: duplicate photos reused across
// batches, farmers with repeated complaints, and listings priced far from
// the market reference. These are flags for a person to review — never
// automatic verdicts.
import "server-only";
import { MANDI_FOR_AREA, MANDIS } from "@/lib/areas";
import { cropName } from "@/lib/crops";
import { db } from "@/lib/db";
import { round2 } from "@/lib/fees";
import { RETAIL_MARKUP } from "@/lib/pricing";

const DAY = 86_400_000;
/** A listing priced above / below these multiples of the reference is flagged. */
export const PRICE_HIGH = 1.5;
export const PRICE_LOW = 0.6;
/** Complaint rules over the last 30 days. */
export const COMPLAINT_MIN = 3;
export const COMPLAINT_RATE = 0.2;

export interface TrustReport {
  duplicates: {
    batchId: string;
    crop: string;
    status: string;
    farmer: { id: string; name: string; area: string | null; suspended: boolean };
    copies: number;
    imageUrl: string;
    matchesBatchId: string | null;
    matchesFarmer: string | null;
    sameFarmer: boolean;
    createdAt: string;
  }[];
  complaints: {
    farmer: { id: string; name: string; area: string | null; suspended: boolean; reliabilityScore: number };
    orders: number;
    complaints: number;
    disputes: number;
    rate: number;
    avgRating: number | null;
    issues: Record<string, number>;
  }[];
  priceOutliers: {
    listingId: string;
    title: string;
    crop: string;
    unit: string;
    area: string;
    status: string;
    price: number;
    reference: number;
    ratio: number;
    direction: "high" | "low";
    farmer: { id: string; name: string };
  }[];
  suspended: { id: string; name: string; role: string; area: string | null; phone: string }[];
}

/** Builds the full trust report. */
export async function trustReport(): Promise<TrustReport> {
  const since = new Date(Date.now() - 30 * DAY);
  const [dupMedia, orders, feedback, listings, prices, suspended] = await Promise.all([
    db.mediaAsset.findMany({
      where: { isDuplicate: true },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { batch: { select: { id: true, crop: true, status: true, createdAt: true, farmer: { select: { id: true, name: true, area: true, suspended: true } } } } },
    }),
    db.order.findMany({
      where: { createdAt: { gte: since }, status: { in: ["DELIVERED", "COLLECTED", "DISPUTED"] } },
      select: { farmerId: true, status: true },
    }),
    db.feedback.findMany({ where: { createdAt: { gte: since } }, select: { rating: true, issue: true, order: { select: { farmerId: true } } } }),
    db.listing.findMany({ where: { status: { in: ["ACTIVE", "PAUSED"] } }, include: { farmer: { select: { id: true, name: true } } } }),
    db.marketPrice.findMany({ where: { date: { gte: new Date(Date.now() - 5 * DAY) } }, orderBy: { date: "desc" } }),
    db.user.findMany({ where: { suspended: true }, select: { id: true, name: true, role: true, area: true, phone: true }, orderBy: { name: "asc" } }),
  ]);

  // Duplicates, one row per flagged batch.
  const byBatch = new Map<string, typeof dupMedia>();
  for (const m of dupMedia) byBatch.set(m.batchId, [...(byBatch.get(m.batchId) ?? []), m]);
  const originIds = [...new Set(dupMedia.map((m) => m.duplicateOfBatchId).filter((x): x is string => Boolean(x)))];
  const origins = await db.batch.findMany({ where: { id: { in: originIds } }, select: { id: true, farmerId: true, farmer: { select: { name: true } } } });
  const originById = new Map(origins.map((o) => [o.id, o]));
  const duplicates = [...byBatch.values()].map((media) => {
    const b = media[0].batch;
    const origin = media[0].duplicateOfBatchId ? originById.get(media[0].duplicateOfBatchId) : undefined;
    return {
      batchId: b.id,
      crop: b.crop,
      status: b.status,
      farmer: b.farmer,
      copies: media.length,
      imageUrl: media[0].url,
      matchesBatchId: media[0].duplicateOfBatchId,
      matchesFarmer: origin?.farmer.name ?? null,
      sameFarmer: origin ? origin.farmerId === b.farmer.id : false,
      createdAt: b.createdAt.toISOString(),
    };
  });

  // Complaints per farmer: feedback with an issue, plus disputed orders.
  const stats = new Map<string, { orders: number; complaints: number; disputes: number; ratings: number[]; issues: Record<string, number> }>();
  const row = (id: string) => {
    let s = stats.get(id);
    if (!s) stats.set(id, (s = { orders: 0, complaints: 0, disputes: 0, ratings: [], issues: {} }));
    return s;
  };
  for (const o of orders) {
    const s = row(o.farmerId);
    s.orders++;
    if (o.status === "DISPUTED") s.disputes++;
  }
  for (const f of feedback) {
    const s = row(f.order.farmerId);
    s.ratings.push(f.rating);
    if (f.issue && f.issue !== "NONE") {
      s.complaints++;
      s.issues[f.issue] = (s.issues[f.issue] ?? 0) + 1;
    }
  }
  const flaggedIds = [...stats.entries()]
    .filter(([, s]) => {
      const total = Math.max(s.complaints, s.disputes);
      return total >= COMPLAINT_MIN || (total >= 2 && total / Math.max(1, s.orders) >= COMPLAINT_RATE);
    })
    .map(([id]) => id);
  const farmers = await db.user.findMany({ where: { id: { in: flaggedIds } }, select: { id: true, name: true, area: true, suspended: true, reliabilityScore: true } });
  const complaints = farmers
    .map((farmer) => {
      const s = stats.get(farmer.id)!;
      const total = Math.max(s.complaints, s.disputes);
      return {
        farmer,
        orders: s.orders,
        complaints: s.complaints,
        disputes: s.disputes,
        rate: round2(total / Math.max(1, s.orders)),
        avgRating: s.ratings.length ? round2(s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length) : null,
        issues: s.issues,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  // Price outliers against the latest modal price at the listing's mandi.
  const latest = new Map<string, number>();
  for (const p of prices) {
    const key = `${p.crop}|${p.area}`;
    if (!latest.has(key)) latest.set(key, p.modalPrice);
    if (!latest.has(p.crop)) latest.set(p.crop, p.modalPrice);
  }
  const priceOutliers: TrustReport["priceOutliers"] = [];
  for (const l of listings) {
    const mandi = MANDI_FOR_AREA[l.area] ?? MANDIS[0];
    const modal = latest.get(`${l.crop}|${mandi}`) ?? latest.get(l.crop);
    if (!modal) continue;
    const reference = round2(modal * RETAIL_MARKUP);
    const ratio = round2(l.pricePerUnit / reference);
    if (ratio <= PRICE_HIGH && ratio >= PRICE_LOW) continue;
    priceOutliers.push({
      listingId: l.id,
      title: l.title,
      crop: cropName(l.crop),
      unit: l.unit,
      area: l.area,
      status: l.status,
      price: l.pricePerUnit,
      reference,
      ratio,
      direction: ratio > PRICE_HIGH ? "high" : "low",
      farmer: l.farmer,
    });
  }
  priceOutliers.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));

  return { duplicates, complaints, priceOutliers, suspended };
}
