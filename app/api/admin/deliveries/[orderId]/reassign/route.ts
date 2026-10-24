// POST /api/admin/deliveries/[orderId]/reassign { workerId } — move an
// undelivered run to another rider. The new rider must still verify the
// customer's OTP; any active code stays valid for the recipient.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { notify } from "@/lib/orders/lifecycle";

type Params = { orderId: string };
const body = z.object({ workerId: z.string().min(1) });

/** Reassigns the delivery (doorstep runs only). */
export const POST = handler<z.infer<typeof body>, undefined, Params>({ roles: ["ADMIN"], body }, async ({ user, params, body }) => {
  const d = await db.delivery.findUnique({ where: { orderId: params.orderId } });
  if (!d || d.mode !== "DELIVERY") throw new HttpError(404, "No doorstep delivery for this order");
  if (d.status === "DELIVERED") throw new HttpError(409, "Already delivered");
  const rider = await db.user.findUnique({ where: { id: body.workerId } });
  if (!rider || rider.role !== "DELIVERY" || rider.suspended) throw new HttpError(400, "Pick an active rider");
  await db.delivery.update({ where: { id: d.id }, data: { workerId: rider.id, status: d.status === "UNASSIGNED" ? "ASSIGNED" : d.status, assignedAt: new Date(), failureReason: null } });
  await audit({ actorId: user.id, action: "DELIVERY_REASSIGNED", entity: "Order", entityId: params.orderId, meta: { from: d.workerId, to: rider.id } });
  publish({ type: "delivery.updated", id: params.orderId, userIds: [rider.id, ...(d.workerId ? [d.workerId] : [])], roles: ["ADMIN"] });
  await notify(params.orderId);
  return { workerId: rider.id, name: rider.name };
});
