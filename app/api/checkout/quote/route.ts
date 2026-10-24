// POST /api/checkout/quote — price a cart (no side effects): per-farmer
// orders, delivery fees, stock/area issues, totals.
import { handler } from "@/lib/api";
import { checkoutSchema, quoteCheckout, type CheckoutInput } from "@/lib/orders/checkout";

/** Returns the server-side quote used by the checkout screen. */
export const POST = handler<CheckoutInput>({ roles: ["CONSUMER", "BULK_BUYER"], body: checkoutSchema }, async ({ user, body }) =>
  quoteCheckout(user, body),
);
