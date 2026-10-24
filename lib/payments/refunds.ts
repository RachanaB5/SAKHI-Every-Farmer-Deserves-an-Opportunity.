// Refunds for orders paid through Razorpay: a cancelled order, a farm
// that ran out of stock after payment, or a dispute settled in the
// buyer's favour. Each order's share of the checkout's payment is
// refunded on its own (Razorpay allows several partial refunds).
import "server-only";
import { db } from "@/lib/db";
import { razorpayConfig, refundPayment } from "./razorpay";

export type RefundOutcome = "refunded" | "pending" | "none";

/**
 * Refunds an order's Razorpay payment and records the refund id. A failed
 * refund is recorded on the payment so the buyer and admins see it is
 * still owed, never shown as done.
 * @returns "none" when the order has no unrefunded Razorpay payment
 */
export async function refundGatewayPayment(orderId: string, reason: string): Promise<RefundOutcome> {
  const p = await db.payment.findUnique({ where: { orderId } });
  if (!p || p.provider !== "RAZORPAY" || p.status === "REFUNDED" || !p.providerPaymentId) return "none";
  const c = razorpayConfig();
  if (!c) {
    await db.payment.update({ where: { orderId }, data: { failureReason: "Refund owed: Razorpay keys are missing on the server" } });
    return "pending";
  }
  try {
    const refund = await refundPayment(c, p.providerPaymentId, p.amount, { order: orderId, reason: reason.slice(0, 200) });
    await db.payment.update({ where: { orderId }, data: { status: "REFUNDED", refundedAt: new Date(), providerRefundId: refund.id, failureReason: null } });
    return "refunded";
  } catch (e) {
    await db.payment.update({ where: { orderId }, data: { failureReason: `Refund owed: Razorpay didn't accept it (${(e as Error).message})` } });
    return "pending";
  }
}
