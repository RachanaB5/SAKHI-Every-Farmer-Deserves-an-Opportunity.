// POST /api/payments/razorpay/webhook — Razorpay's server-to-server events.
// Places the orders of a paid checkout whose buyer closed the tab before
// the browser could verify it, and notes failed attempts. The body is
// checked against X-Razorpay-Signature (HMAC of the raw body with
// RAZORPAY_WEBHOOK_SECRET) before anything is read from it.
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, HttpError, ok, toErrorResponse } from "@/lib/api";
import { finalizeIntent, recordFailedAttempt } from "@/lib/payments/checkout";
import { razorpayConfig, verifyWebhookSignature } from "@/lib/payments/razorpay";

interface RazorpayEvent {
  event: string;
  payload?: { payment?: { entity?: { id: string; order_id: string | null; error_description?: string | null } } };
}

/** Acknowledges every correctly signed event; Razorpay retries anything that isn't a 2xx. */
export async function POST(req: NextRequest) {
  const c = razorpayConfig();
  if (!c?.webhookSecret) return fail(503, "Razorpay webhooks aren't set up on this server");
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(c.webhookSecret, raw, signature)) return fail(400, "Invalid signature");

  let evt: RazorpayEvent;
  try {
    evt = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return fail(400, "Body must be JSON");
  }
  const payment = evt.payload?.payment?.entity;
  if (!payment?.order_id) return ok({ handled: false });

  try {
    if (evt.event === "payment.failed") {
      await recordFailedAttempt(payment.order_id, payment.error_description || "Payment failed");
      return ok({ handled: true });
    }
    if (evt.event === "payment.authorized" || evt.event === "payment.captured" || evt.event === "order.paid") {
      const intent = await db.paymentIntent.findUnique({ where: { providerOrderId: payment.order_id }, select: { id: true } });
      // An order created elsewhere on the same Razorpay account isn't ours to place.
      if (!intent) return ok({ handled: false });
      await finalizeIntent(intent.id, payment.id);
      return ok({ handled: true });
    }
    return ok({ handled: false });
  } catch (e) {
    // A mismatch won't fix itself on a retry; only server-side failures ask Razorpay to try again.
    if (e instanceof HttpError && e.status < 500) return ok({ handled: false, reason: e.message });
    return toErrorResponse(e);
  }
}
