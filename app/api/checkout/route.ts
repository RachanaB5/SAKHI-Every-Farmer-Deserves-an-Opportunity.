// POST /api/checkout — place the cart: per-farmer orders, simulated
// payment authorisation, then atomic stock reservation + capture.
import { handler } from "@/lib/api";
import { checkoutSchema, placeCheckout, type CheckoutInput } from "@/lib/orders/checkout";
import { rateLimit } from "@/lib/rate-limit";

/** Places orders and returns which farmers' orders went through. */
export const POST = handler<CheckoutInput>({ roles: ["CONSUMER", "BULK_BUYER"], body: checkoutSchema }, async ({ user, body }) => {
  rateLimit(`checkout:${user.id}`, 10, 60_000);
  return placeCheckout(user, body);
});
