// Farmer earnings for a period, using the same definitions as the payments
// page: order value (goods subtotal of confirmed orders), platform fee,
// estimated net (settlement net, or the settlement formula until delivery),
// pending settlement, settled, and awaiting delivery. Never conflates them.
import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { round2, settlementFor } from "@/lib/fees";
import { HOLDS_STOCK } from "@/lib/orders/state";
import type { EarningsCard } from "@/lib/assistant/types";

export type EarningsPeriod = EarningsCard["period"];

/** Orders that count as confirmed business (paid, not cancelled). */
const CONFIRMED: OrderStatus[] = ["CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "DELIVERED", "COLLECTED", "DISPUTED"];

/** Start of the period (rolling 7 / 30 days; "today" is since local midnight). */
export function periodStart(period: EarningsPeriod, now: Date = new Date()): Date | null {
  if (period === "all") return null;
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(now.getTime() - (period === "week" ? 7 : 30) * 86_400_000);
}

/** The farmer's own earnings summary — scoped to `farmerId` only. */
export async function farmerEarnings(farmerId: string, period: EarningsPeriod, now: Date = new Date()): Promise<EarningsCard> {
  const since = periodStart(period, now);
  const orders = await db.order.findMany({
    where: { farmerId, status: { in: CONFIRMED }, ...(since && { createdAt: { gte: since } }) },
    select: { status: true, fulfilment: true, subtotal: true, platformFee: true, deliveryFee: true, delivery: { select: { cost: true } }, settlement: { select: { status: true, net: true } } },
  });
  let orderValue = 0;
  let platformFee = 0;
  let estimatedNet = 0;
  let settled = 0;
  let pending = 0;
  let awaiting = 0;
  for (const o of orders) {
    orderValue += o.subtotal;
    platformFee += o.platformFee;
    if (o.settlement) {
      estimatedNet += o.settlement.net;
      if (o.settlement.status === "SETTLED") settled += o.settlement.net;
      else pending += o.settlement.net;
      continue;
    }
    const est = settlementFor({ subtotal: o.subtotal, platformFee: o.platformFee, buyerDeliveryFee: o.deliveryFee, actualCourierCost: o.fulfilment === "PICKUP" ? 0 : (o.delivery?.cost ?? 0) });
    estimatedNet += est.net;
    if (HOLDS_STOCK.includes(o.status)) awaiting += est.net;
  }
  return {
    period,
    orders: orders.length,
    orderValue: round2(orderValue),
    platformFee: round2(platformFee),
    estimatedNet: round2(estimatedNet),
    settled: round2(settled),
    pending: round2(pending),
    awaiting: round2(awaiting),
  };
}
