// POST /api/checkout — place the cart: per-farmer orders, simulated
// payment authorisation, then atomic stock reservation + capture. When
// Razorpay is set up, carts are paid through /api/payments/razorpay
// instead and this simulated route is closed.
import { handler, HttpError } from "@/lib/api";
import { checkoutSchema, placeCheckout, type CheckoutInput } from "@/lib/orders/checkout";
import { razorpayConfig } from "@/lib/payments/razorpay";
import { rateLimit } from "@/lib/rate-limit";

/** Places orders and returns which farmers' orders went through. */
export const POST = handler<CheckoutInput>({ roles: ["CONSUMER", "BULK_BUYER"], body: checkoutSchema }, async ({ user, body }) => {
  if (razorpayConfig()) throw new HttpError(409, "Please pay through Razorpay at checkout");
  rateLimit(`checkout:${user.id}`, 10, 60_000);
  return placeCheckout(user, body);
});
