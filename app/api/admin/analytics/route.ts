// GET /api/admin/analytics — marketplace health for the last 30 days:
// active farmers, orders, GMV, fulfilment rate, farmer earnings, kg sold,
// kg rescued via the surplus flow, ratings, plus series for the charts.
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { round2 } from "@/lib/fees";

const DAY = 86_400_000;
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Admin overview data. */
export const GET = handler({ roles: ["ADMIN"] }, async () => {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const [orders, settlements, rescued, ratings, totalFarmers, listingFarmers, buyers, pendingReview, disputes] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: since30 } }, include: { items: { include: { listing: { select: { crop: true } } } } } }),
    db.settlement.findMany({ where: { createdAt: { gte: since30 } }, select: { net: true, platformFee: true, farmerId: true } }),
    db.offer.findMany({ where: { fromSurplus: true, status: "ACCEPTED" }, select: { qtyKg: true } }),
    db.feedback.groupBy({ by: ["rating"], _count: true }),
    db.user.count({ where: { role: "FARMER" } }),
    db.listing.findMany({ where: { status: "ACTIVE" }, select: { farmerId: true }, distinct: ["farmerId"] }),
    db.user.count({ where: { role: { in: ["CONSUMER", "BULK_BUYER"] } } }),
    db.batch.count({ where: { status: "PENDING_REVIEW" } }),
    db.order.count({ where: { status: "DISPUTED" } }),
  ]);

  const live = orders.filter((o) => !["CANCELLED", "PLACED"].includes(o.status));
  const handed = orders.filter((o) => ["DELIVERED", "COLLECTED"].includes(o.status));
  const terminal = orders.filter((o) => ["DELIVERED", "COLLECTED", "CANCELLED", "DISPUTED"].includes(o.status));
  const activeFarmers = new Set([...live.map((o) => o.farmerId), ...listingFarmers.map((l) => l.farmerId)]);

  const series = Array.from({ length: 30 }, (_, i) => ({ date: key(new Date(now.getTime() - (29 - i) * DAY)), gmv: 0, orders: 0 }));
  const byDay = new Map(series.map((s) => [s.date, s]));
  const byArea = new Map<string, number>();
  const byType = { RETAIL: 0, BULK: 0 };
  const cropKg = new Map<string, number>();
  for (const o of live) {
    const s = byDay.get(key(o.createdAt));
    if (s) {
      s.gmv = round2(s.gmv + o.total);
      s.orders += 1;
    }
    byArea.set(o.area, round2((byArea.get(o.area) ?? 0) + o.total));
    byType[o.type] = round2(byType[o.type] + o.total);
  }
  for (const o of handed) {
    for (const i of o.items) if (i.unit === "kg") cropKg.set(i.listing.crop, round2((cropKg.get(i.listing.crop) ?? 0) + i.qty));
  }
  const ratingCounts = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: ratings.find((x) => x.rating === r)?._count ?? 0 }));
  const ratingTotal = ratingCounts.reduce((s, r) => s + r.count, 0);

  return {
    kpis: {
      activeFarmers: activeFarmers.size,
      totalFarmers,
      buyers,
      orders: live.length,
      gmv: round2(live.reduce((s, o) => s + o.total, 0)),
      fulfilmentRate: terminal.length ? Math.round((handed.length / terminal.length) * 1000) / 10 : 0,
      farmerEarnings: round2(settlements.reduce((s, x) => s + x.net, 0)),
      platformRevenue: round2(settlements.reduce((s, x) => s + x.platformFee, 0)),
      kgSold: round2([...cropKg.values()].reduce((a, b) => a + b, 0)),
      kgRescued: round2(rescued.reduce((s, o) => s + o.qtyKg, 0)),
      avgRating: ratingTotal ? round2(ratingCounts.reduce((s, r) => s + r.rating * r.count, 0) / ratingTotal) : null,
      pendingReview,
      disputes,
    },
    series,
    byArea: [...byArea.entries()].map(([area, gmv]) => ({ area, gmv })).sort((a, b) => b.gmv - a.gmv),
    byType,
    topCrops: [...cropKg.entries()].map(([crop, kg]) => ({ crop, kg })).sort((a, b) => b.kg - a.kg).slice(0, 6),
    ratings: ratingCounts,
  };
});
