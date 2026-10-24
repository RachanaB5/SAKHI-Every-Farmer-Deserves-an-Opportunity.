// GET /api/farmer/payments — the farmer's money, honestly staged:
//   awaiting  — buyer paid (captured), goods not yet handed over → NOT yet the farmer's
//   pending   — handover verified, settlement scheduled
//   settled   — paid out
// Each row carries the fee breakdown (gross − commission − delivery share = net).
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { round2, settlementFor } from "@/lib/fees";
import { HOLDS_STOCK } from "@/lib/orders/state";
import { commissionPct } from "@/lib/settings";

/** Summary + per-order timeline for the signed-in farmer. */
export const GET = handler({ roles: ["FARMER"] }, async ({ user }) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [settlements, inFlight] = await Promise.all([
    db.settlement.findMany({
      where: { farmerId: user.id, OR: [{ status: "PENDING" }, { settledAt: { gte: since } }] },
      include: { order: { select: { id: true, code: true, createdAt: true, fulfilment: true, type: true, payment: { select: { capturedAt: true, authorisedAt: true } }, delivery: { select: { verifiedAt: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    db.order.findMany({
      where: { farmerId: user.id, status: { in: HOLDS_STOCK } },
      include: { payment: true, delivery: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const awaitingRows = inFlight.map((o) => {
    const est = settlementFor({ subtotal: o.subtotal, platformFee: o.platformFee, buyerDeliveryFee: o.deliveryFee, actualCourierCost: o.fulfilment === "PICKUP" ? 0 : o.delivery?.cost ?? 0 });
    return {
      orderId: o.id,
      code: o.code,
      stage: "AWAITING" as const,
      orderStatus: o.status,
      ...est,
      estimated: true,
      authorisedAt: o.payment?.authorisedAt.toISOString() ?? null,
      capturedAt: o.payment?.capturedAt?.toISOString() ?? null,
      deliveredAt: null,
      settledAt: null,
      createdAt: o.createdAt.toISOString(),
    };
  });
  const settledRows = settlements.map((s) => ({
    orderId: s.order.id,
    code: s.order.code,
    stage: s.status === "SETTLED" ? ("SETTLED" as const) : ("PENDING" as const),
    orderStatus: null,
    gross: s.gross,
    platformFee: s.platformFee,
    deliveryCost: s.deliveryCost,
    net: s.net,
    estimated: false,
    authorisedAt: s.order.payment?.authorisedAt.toISOString() ?? null,
    capturedAt: s.order.payment?.capturedAt?.toISOString() ?? null,
    deliveredAt: s.order.delivery?.verifiedAt?.toISOString() ?? s.createdAt.toISOString(),
    settledAt: s.settledAt?.toISOString() ?? null,
    createdAt: s.order.createdAt.toISOString(),
  }));
  const sum = (rows: { net: number }[]) => round2(rows.reduce((a, r) => a + r.net, 0));
  const pending = settledRows.filter((r) => r.stage === "PENDING");
  const settled = settledRows.filter((r) => r.stage === "SETTLED");
  return {
    commissionPct: await commissionPct(),
    summary: {
      awaiting: { count: awaitingRows.length, net: sum(awaitingRows) },
      pending: { count: pending.length, net: sum(pending) },
      settled30d: { count: settled.length, net: sum(settled) },
      fees30d: round2(settledRows.reduce((a, r) => a + r.platformFee, 0)),
      deliveryCosts30d: round2(settledRows.reduce((a, r) => a + r.deliveryCost, 0)),
      gross30d: round2(settledRows.reduce((a, r) => a + r.gross, 0)),
    },
    rows: [...awaitingRows, ...settledRows],
  };
});
