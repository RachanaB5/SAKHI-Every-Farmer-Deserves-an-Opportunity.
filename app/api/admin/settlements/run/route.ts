// POST /api/admin/settlements/run — simulated payout batch: every PENDING
// settlement becomes SETTLED (in production this would follow the
// payment gateway's transfer confirmation).
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { round2 } from "@/lib/fees";

/** Settles all pending payouts and reports the batch. */
export const POST = handler({ roles: ["ADMIN"] }, async ({ user }) => {
  const pending = await db.settlement.findMany({ where: { status: "PENDING" }, select: { id: true, farmerId: true, net: true, orderId: true } });
  if (!pending.length) return { settled: 0, amount: 0 };
  const now = new Date();
  // Conditional on status so a concurrent run can't double-settle.
  await db.settlement.updateMany({ where: { id: { in: pending.map((p) => p.id) }, status: "PENDING" }, data: { status: "SETTLED", settledAt: now } });
  const amount = round2(pending.reduce((s, p) => s + p.net, 0));
  await audit({ actorId: user.id, action: "PAYOUT_BATCH", entity: "Settlement", entityId: now.toISOString(), meta: { count: pending.length, amount } });
  for (const farmerId of new Set(pending.map((p) => p.farmerId))) {
    publish({ type: "settlement.updated", id: farmerId, userIds: [farmerId], roles: ["ADMIN"] });
  }
  return { settled: pending.length, amount };
});
