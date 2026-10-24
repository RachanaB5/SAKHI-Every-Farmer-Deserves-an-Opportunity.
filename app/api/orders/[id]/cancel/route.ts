// POST /api/orders/[id]/cancel — cancel before handover.
//   Buyer: until the farmer has packed it.  Farmer: until handover (e.g.
//   damaged stock).  Admin: any time before handover.
// Releases reserved stock and refunds a captured payment.
import { z } from "zod";
import { handler, HttpError } from "@/lib/api";
import { cancelOrder } from "@/lib/orders/lifecycle";
import { loadOrderFor } from "@/lib/orders/queries";
import { recomputeReliability } from "@/lib/reliability";

type Params = { id: string };
const body = z.object({ reason: z.string().trim().min(3, "Tell us why").max(200) });

/** Cancels if the caller's role still may. */
export const POST = handler<z.infer<typeof body>, undefined, Params>({ roles: [], body }, async ({ user, params, body }) => {
  const order = await loadOrderFor(user, params.id);
  const buyerWindow = ["PLACED", "CONFIRMED"].includes(order.status);
  const preHandover = ["PLACED", "CONFIRMED", "PACKED", "READY_FOR_PICKUP"].includes(order.status);
  const allowed =
    (user.id === order.buyerId && buyerWindow) || (user.id === order.farmerId && preHandover) || (user.role === "ADMIN" && preHandover);
  if (!allowed) {
    throw new HttpError(409, user.id === order.buyerId ? "Your farmer has already packed this order, contact support to cancel" : "This order can no longer be cancelled");
  }
  await cancelOrder(order.id, user.id, body.reason);
  if (user.id === order.farmerId) await recomputeReliability(order.farmerId);
  return { cancelled: true };
});
