// POST /api/payments/razorpay/verify { razorpay_order_id, razorpay_payment_id,
// razorpay_signature } — check Razorpay's signed result, confirm the payment
// with Razorpay and place the orders.
import { handler } from "@/lib/api";
import { verifyRazorpayPayment, verifySchema, type VerifyInput } from "@/lib/payments/checkout";
import { rateLimit } from "@/lib/rate-limit";

/** Places the paid orders and returns which farmers' orders went through. */
export const POST = handler<VerifyInput>({ roles: ["CONSUMER", "BULK_BUYER"], body: verifySchema }, async ({ user, body }) => {
  rateLimit(`checkout-verify:${user.id}`, 20, 60_000);
  return verifyRazorpayPayment(user, body);
});
