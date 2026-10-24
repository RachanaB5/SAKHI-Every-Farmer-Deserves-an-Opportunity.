// POST /api/pickups/verify — farmer confirms a self-pickup handover with
// the buyer's signed QR ({ qrToken }) or order code + OTP ({ code, otp }).
// Only the farmer who owns the order may verify; same rules as delivery.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { verifyHandover } from "@/lib/delivery/handover";
import { normaliseOrderCode } from "@/lib/orders/code";
import { readPickupToken } from "@/lib/otp";
import { rateLimit } from "@/lib/rate-limit";

const body = z.union([
  z.object({ qrToken: z.string().min(20).max(2000) }),
  z.object({ code: z.string().trim().min(3).max(20), otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }),
]);

/** Verifies and completes the pickup (COLLECTED + PENDING settlement). */
export const POST = handler<z.infer<typeof body>>({ roles: ["FARMER"], body }, async ({ user, body }) => {
  rateLimit(`pickup:${user.id}`, 30, 60_000);
  if ("qrToken" in body) {
    const token = await readPickupToken(body.qrToken);
    if (!token) throw new HttpError(400, "This QR isn't a valid FoodFlow pickup code (or it expired)");
    const order = await db.order.findUnique({ where: { id: token.orderId }, select: { id: true, code: true } });
    if (!order) throw new HttpError(404, "Order not found");
    return { code: order.code, ...(await verifyHandover(order.id, user, { qrToken: body.qrToken })) };
  }
  const code = normaliseOrderCode(body.code);
  const order = await db.order.findUnique({ where: { code }, select: { id: true, code: true } });
  if (!order) throw new HttpError(404, `No order with code ${code}`);
  return { code: order.code, ...(await verifyHandover(order.id, user, { otp: body.otp })) };
});
