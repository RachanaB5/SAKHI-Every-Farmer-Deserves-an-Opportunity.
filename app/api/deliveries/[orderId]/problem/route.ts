// POST /api/deliveries/[orderId]/problem { reason } — rider reports a
// failed handover attempt (nobody home, wrong address…). Logged for
// admins; the order stays with the rider until resolved.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";

type Params = { orderId: string };
const body = z.object({ reason: z.string().trim().min(3).max(200) });

/** Records the problem against the delivery. */
export const POST = handler<z.infer<typeof body>, undefined, Params>({ roles: ["DELIVERY"], body }, async ({ user, params, body }) => {
  const d = await db.delivery.findUnique({ where: { orderId: params.orderId }, include: { order: { select: { buyerId: true, farmerId: true } } } });
  if (!d || d.workerId !== user.id) throw new HttpError(403, "You're not the rider assigned to this order");
  await db.$transaction([
    db.deliveryAttempt.create({ data: { deliveryId: d.id, actorId: user.id, method: "REPORT", success: false, reason: body.reason } }),
    db.delivery.update({ where: { id: d.id }, data: { failureReason: body.reason } }),
  ]);
  await audit({ actorId: user.id, action: "HANDOVER_PROBLEM", entity: "Order", entityId: params.orderId, meta: { reason: body.reason } });
  publish({ type: "delivery.updated", id: params.orderId, userIds: [d.order.buyerId, d.order.farmerId], roles: ["ADMIN"] });
  return { reported: true };
});
