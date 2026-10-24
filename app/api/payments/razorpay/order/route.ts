// POST /api/payments/razorpay/order — price the cart and open a Razorpay
// order for it. Nothing is placed until the payment is verified.
import { handler } from "@/lib/api";
import { checkoutSchema, type CheckoutInput } from "@/lib/orders/checkout";
import { startRazorpayCheckout } from "@/lib/payments/checkout";
import { rateLimit } from "@/lib/rate-limit";

/** Returns the options Razorpay Checkout opens with. */
export const POST = handler<CheckoutInput>({ roles: ["CONSUMER", "BULK_BUYER"], body: checkoutSchema }, async ({ user, body }) => {
  rateLimit(`checkout:${user.id}`, 10, 60_000);
  return startRazorpayCheckout(user, body);
});
