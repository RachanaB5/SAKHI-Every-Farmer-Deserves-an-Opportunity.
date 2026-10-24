// POST /api/admin/orders/[id]/resolve { action, note } — close a dispute.
//   REFUND  → payment REFUNDED (simulated), order CANCELLED, an unpaid
//             settlement is reversed to ₹0 (a settled one is flagged for recovery)
//   DISMISS → order back to DELIVERED / COLLECTED, payout unaffected
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { withTxRetry } from "@/lib/inventory";
import { notify } from "@/lib/orders/lifecycle";
import { moveOrder } from "@/lib/orders/state";
import { recomputeReliability } from "@/lib/reliability";

type Params = { id: string };
const body = z.object({ action: z.enum(["REFUND", "DISMISS"]), note: z.string().trim().min(3, "Add a short note").max(300) });

/** Resolves a DISPUTED order. */
export const POST = handler<z.infer<typeof body>, undefined, Params>({ roles: ["ADMIN"], body }, async ({ user, params, body }) => {
  const order = await db.order.findUnique({ where: { id: params.id }, include: { payment: true, settlement: true } });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.status !== "DISPUTED") throw new HttpError(409, "Only disputed orders can be resolved here");

  let recovery = false;
  await withTxRetry(async (tx) => {
    if (body.action === "DISMISS") {
      const ok = await moveOrder(tx, order.id, order.fulfilment === "PICKUP" ? "COLLECTED" : "DELIVERED", { from: ["DISPUTED"], actorId: user.id, note: `Dispute closed: ${body.note}` });
      if (!ok) throw new HttpError(409, "Order changed, refresh and try again");
      return;
    }
    const ok = await moveOrder(tx, order.id, "CANCELLED", { from: ["DISPUTED"], actorId: user.id, note: `Refunded: ${body.note}`, data: { cancelReason: `Refunded after dispute, ${body.note}` } });
    if (!ok) throw new HttpError(409, "Order changed, refresh and try again");
    if (order.payment) await tx.payment.update({ where: { orderId: order.id }, data: { status: "REFUNDED", refundedAt: new Date() } });
    if (order.settlement?.status === "PENDING") {
      // Farmer hasn't been paid yet: reverse the payout instead of paying for rejected goods.
      await tx.settlement.update({ where: { orderId: order.id }, data: { net: 0, platformFee: 0, deliveryCost: 0 } });
    } else if (order.settlement?.status === "SETTLED") {
      recovery = true;
    }
  });
  await audit({ actorId: user.id, action: body.action === "REFUND" ? "DISPUTE_REFUNDED" : "DISPUTE_DISMISSED", entity: "Order", entityId: order.id, meta: { note: body.note, amount: order.total, recovery } });
  await recomputeReliability(order.farmerId);
  await notify(order.id);
  return { resolved: body.action, recoveryNeeded: recovery };
});
