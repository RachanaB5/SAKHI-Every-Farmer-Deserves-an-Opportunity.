// Public landing-page data: live impact counters and the mandi price
// ticker. Read straight from the database; degrades to zeros (never
// crashes the page) if the database isn't set up yet.
import "server-only";
import { MANDIS } from "@/lib/areas";
import { CROPS, isCropSlug } from "@/lib/crops";
import { db } from "@/lib/db";
import { round2 } from "@/lib/fees";

export interface ImpactStats {
  farmers: number;
  kgSold: number;
  kgRescued: number;
  ordersDelivered: number;
  farmerShare: number;
}

/** Counters for the landing page hero/impact section. */
export async function getImpactStats(): Promise<ImpactStats> {
  try {
    const [farmers, items, rescued, delivered, settlements] = await Promise.all([
      db.user.count({ where: { role: "FARMER" } }),
      db.orderItem.findMany({ where: { unit: "kg", order: { status: { in: ["DELIVERED", "COLLECTED"] } } }, select: { qty: true } }),
      db.offer.findMany({ where: { fromSurplus: true, status: "ACCEPTED" }, select: { qtyKg: true } }),
      db.order.count({ where: { status: { in: ["DELIVERED", "COLLECTED"] } } }),
      db.settlement.aggregate({ _sum: { gross: true, net: true } }),
    ]);
    const gross = settlements._sum.gross ?? 0;
    return {
      farmers,
      kgSold: Math.round(items.reduce((s, i) => s + i.qty, 0)),
      kgRescued: Math.round(rescued.reduce((s, o) => s + o.qtyKg, 0)),
      ordersDelivered: delivered,
      // Share of every rupee spent on goods that reaches the farmer.
      farmerShare: gross ? Math.round(((settlements._sum.net ?? 0) / gross) * 100) : 0,
    };
  } catch {
    return { farmers: 0, kgSold: 0, kgRescued: 0, ordersDelivered: 0, farmerShare: 0 };
  }
}

export interface TickerItem {
  crop: string;
  name: string;
  price: number;
  unit: string;
  changePct: number;
}

/** Today's modal price per crop at the reference mandi with 7-day change. */
export async function getMandiTicker(): Promise<TickerItem[]> {
  try {
    const since = new Date(Date.now() - 9 * 86_400_000);
    const rows = await db.marketPrice.findMany({ where: { area: MANDIS[0], date: { gte: since } }, orderBy: { date: "asc" } });
    const byCrop = new Map<string, typeof rows>();
    for (const r of rows) byCrop.set(r.crop, [...(byCrop.get(r.crop) ?? []), r]);
    return [...byCrop.entries()]
      .filter(([crop]) => isCropSlug(crop))
      .map(([crop, series]) => {
        const last = series[series.length - 1];
        const weekAgo = series[Math.max(0, series.length - 8)];
        const info = CROPS[crop as keyof typeof CROPS];
        return {
          crop,
          name: info.names.en,
          price: round2(last.modalPrice),
          unit: info.unit,
          changePct: weekAgo ? round2(((last.modalPrice - weekAgo.modalPrice) / weekAgo.modalPrice) * 100) : 0,
        };
      });
  } catch {
    return [];
  }
}
