// GET /api/deliveries/find?code=FF-XXXXX — rider looks up an order by its
// typed, scanned or spoken code. Finding an order only OPENS it; handing
// over still needs the recipient's OTP.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { normaliseOrderCode } from "@/lib/orders/code";

const query = z.object({ code: z.string().trim().min(3, "Enter the order code").max(40) });

/** Resolves a code to an order id if this rider is assigned to it. */
export const GET = handler<undefined, z.infer<typeof query>>({ roles: ["DELIVERY"], query }, async ({ user, query }) => {
  const code = normaliseOrderCode(query.code);
  const order = await db.order.findUnique({ where: { code }, select: { id: true, delivery: { select: { workerId: true } } } });
  if (!order) throw new HttpError(404, `No order with code ${code}`);
  if (order.delivery?.workerId !== user.id) throw new HttpError(403, `${code} isn't assigned to you`);
  return { orderId: order.id, code };
});
