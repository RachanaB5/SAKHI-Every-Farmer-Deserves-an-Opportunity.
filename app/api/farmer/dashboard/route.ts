// GET /api/farmer/dashboard — everything the farmer home screen shows:
// today's sales, 30-day revenue / fees / delivery costs / net, pending vs
// settled, a 14-day sales series, inventory sell-through, mandi price
// trends for the farmer's crops, order status counts and recent orders.
import { MANDI_FOR_AREA, MANDIS } from "@/lib/areas";
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { isCropSlug } from "@/lib/crops";
import { round2, settlementFor } from "@/lib/fees";
import { soldQty } from "@/lib/inventory";
import { HOLDS_STOCK, IN_FLIGHT } from "@/lib/orders/state";
import { commissionPct } from "@/lib/settings";
import { detectSurplus } from "@/lib/surplus";

const DAY = 86_400_000;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Farmer home data in one round trip. */
export const GET = handler({ roles: ["FARMER"] }, async ({ user }) => {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since14 = new Date(startToday.getTime() - 13 * DAY);

  const [orders, settlements, listings, profile] = await Promise.all([
    db.order.findMany({
      where: { farmerId: user.id, createdAt: { gte: since30 } },
      include: { items: true, delivery: { select: { cost: true } }, buyer: { select: { name: true, orgName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.settlement.findMany({ where: { farmerId: user.id, createdAt: { gte: since30 } } }),
    db.listing.findMany({ where: { farmerId: user.id, status: { in: ["ACTIVE", "PAUSED"] } }, orderBy: { createdAt: "desc" } }),
    db.farmerProfile.findUnique({ where: { userId: user.id }, select: { crops: true } }),
  ]);

  const live = orders.filter((o) => o.status !== "CANCELLED" && o.status !== "PLACED");
  const today = live.filter((o) => o.createdAt >= startToday);
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

  // In-flight orders: money captured from buyers but not yet the farmer's.
  const awaiting = orders.filter((o) => HOLDS_STOCK.includes(o.status)).map((o) =>
    settlementFor({ subtotal: o.subtotal, platformFee: o.platformFee, buyerDeliveryFee: o.deliveryFee, actualCourierCost: o.fulfilment === "PICKUP" ? 0 : o.delivery?.cost ?? 0 }),
  );

  // 14-day daily sales (confirmed or later), with kg moved.
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since14.getTime() + i * DAY);
    return { date: dayKey(d), gross: 0, kg: 0 };
  });
  const byDay = new Map(series.map((s) => [s.date, s]));
  for (const o of live) {
    const s = byDay.get(dayKey(o.createdAt));
    if (!s) continue;
    s.gross = round2(s.gross + o.subtotal);
    s.kg = round2(s.kg + o.items.filter((i) => i.unit === "kg").reduce((a, i) => a + i.qty, 0));
  }

  // Mandi trend for the farmer's crops (up to 3), from their reference mandi.
  const crops = [...new Set([...(((profile?.crops as string[] | null) ?? []).filter(isCropSlug)), ...listings.map((l) => l.crop)])].slice(0, 3);
  // A new farmer with no crops yet still sees the staples' trend.
  if (!crops.length) crops.push("tomato", "onion", "potato");
  const mandi = (user.area && MANDI_FOR_AREA[user.area]) || MANDIS[0];
  const prices = await db.marketPrice.findMany({ where: { crop: { in: crops }, area: mandi, date: { gte: since14 } }, orderBy: { date: "asc" } });
  const trendMap = new Map<string, Record<string, number | string>>();
  for (const p of prices) {
    const k = dayKey(p.date);
    const row = trendMap.get(k) ?? { date: k };
    row[p.crop] = p.modalPrice;
    trendMap.set(k, row);
  }

  const statusCounts = Object.fromEntries(IN_FLIGHT.map((s) => [s, orders.filter((o) => o.status === s).length]));
  const surplus = await detectSurplus(user.id);

  return {
    name: user.name,
    commissionPct: await commissionPct(),
    today: { orders: today.length, sales: sum(today.map((o) => o.subtotal)) },
    last30: {
      gross: sum(settlements.map((s) => s.gross)),
      fees: sum(settlements.map((s) => s.platformFee)),
      deliveryCosts: sum(settlements.map((s) => s.deliveryCost)),
      net: sum(settlements.map((s) => s.net)),
      kgSold: sum(live.filter((o) => ["DELIVERED", "COLLECTED"].includes(o.status)).flatMap((o) => o.items.filter((i) => i.unit === "kg").map((i) => i.qty))),
      orders: live.length,
    },
    money: {
      awaiting: sum(awaiting.map((a) => a.net)),
      pending: sum(settlements.filter((s) => s.status === "PENDING").map((s) => s.net)),
      settled: sum(settlements.filter((s) => s.status === "SETTLED").map((s) => s.net)),
    },
    series,
    trend: { mandi, crops, rows: [...trendMap.values()] },
    inventory: listings.map((l) => ({
      id: l.id,
      title: l.title,
      crop: l.crop,
      unit: l.unit,
      price: l.pricePerUnit,
      status: l.status,
      total: l.totalQty,
      available: l.availableQty,
      reserved: l.reservedQty,
      sold: soldQty(l),
      sellThrough: l.totalQty ? Math.round((soldQty(l) / l.totalQty) * 100) : 0,
      harvestDate: l.harvestDate.toISOString(),
    })),
    statusCounts,
    recent: orders.slice(0, 5).map((o) => ({ id: o.id, code: o.code, status: o.status, buyer: o.buyer.orgName ?? o.buyer.name, total: o.subtotal, createdAt: o.createdAt.toISOString() })),
    surplus: { count: surplus.filter((s) => s.atRisk).length },
  };
});
