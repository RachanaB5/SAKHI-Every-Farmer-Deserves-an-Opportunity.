// POST /api/orders/[id]/otp — the RECIPIENT (buyer) generates or
// regenerates their handover code. The plaintext is returned only here,
// only to the buyer; the server keeps an HMAC. Pickup orders also get a
// signed QR bound to the same code.
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { issueOtp, OTP_MAX_ATTEMPTS, signPickupToken } from "@/lib/otp";
import { rateLimit } from "@/lib/rate-limit";

type Params = { id: string };

/** Issues a fresh 6-digit code (15-minute expiry, 5 attempts). */
export const POST = handler<undefined, undefined, Params>({ roles: ["CONSUMER", "BULK_BUYER"] }, async ({ user, params }) => {
  rateLimit(`otp:${user.id}`, 12, 10 * 60_000);
  const order = await db.order.findUnique({ where: { id: params.id }, include: { delivery: true } });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.buyerId !== user.id) throw new HttpError(403, "Only the person receiving this order can get its code");
  if (!order.delivery) throw new HttpError(409, order.fulfilment === "PICKUP" ? "Your farmer hasn't marked this ready for pickup yet" : "Your farmer hasn't booked a rider yet");
  const ready = order.fulfilment === "PICKUP" ? order.status === "READY_FOR_PICKUP" : ["PACKED", "OUT_FOR_DELIVERY"].includes(order.status);
  if (!ready) throw new HttpError(409, "A handover code isn't needed for this order right now");

  const { otp, expiresAt, nonce } = await issueOtp(order.delivery.id);
  await audit({ actorId: user.id, action: "OTP_ISSUED", entity: "Order", entityId: order.id, meta: { regenerations: order.delivery.otpRegenerations + 1 } });
  publish({ type: "delivery.updated", id: order.id, userIds: [order.farmerId, ...(order.delivery.workerId ? [order.delivery.workerId] : [])] });

  let qr: { token: string; dataUrl: string } | null = null;
  if (order.fulfilment === "PICKUP") {
    const token = await signPickupToken(order.id, nonce, expiresAt);
    qr = { token, dataUrl: await QRCode.toDataURL(token, { margin: 1, width: 360, errorCorrectionLevel: "M" }) };
  }
  return { otp, expiresAt: expiresAt.toISOString(), attempts: OTP_MAX_ATTEMPTS, qr };
});
