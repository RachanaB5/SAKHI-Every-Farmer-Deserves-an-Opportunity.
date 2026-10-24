// Checkout paid through Razorpay.
//
//   start  → price the cart on the server, create a Razorpay order for the
//            total and keep the priced cart as a PaymentIntent. No order
//            exists yet, so farmers never see an unpaid cart.
//   verify → the browser hands back Razorpay's signed result; check the
//            signature, ask Razorpay what was actually paid, capture it if
//            it's only authorised, then place one order per farmer.
//   webhook→ the same finalise step, for buyers who closed the tab before
//            the browser could report back.
//
// Finalising is idempotent: whichever of verify or webhook claims the
// intent first places the orders, the other reads them back. A farm that
// ran out of stock in between gets its share refunded through Razorpay.
import "server-only";
import { randomUUID } from "node:crypto";
import type { PaymentIntent, Prisma, User } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { round2 } from "@/lib/fees";
import { REFUND_DUE_NOTE } from "@/lib/orders/lifecycle";
import { assertPlaceable, placeQuote, quoteCheckout, type CheckoutInput, type CheckoutQuote, type PlaceResult } from "@/lib/orders/checkout";
import { capturePayment, createOrder, describeMethod, fetchPayment, requireRazorpay, toPaise, verifyPaymentSignature, type RazorpayPayment } from "./razorpay";
import { refundGatewayPayment, type RefundOutcome } from "./refunds";

export const verifySchema = z.object({
  razorpay_order_id: z.string().trim().min(1).max(64),
  razorpay_payment_id: z.string().trim().min(1).max(64),
  razorpay_signature: z.string().trim().min(1).max(256),
});
export type VerifyInput = z.infer<typeof verifySchema>;

interface StoredCheckout {
  input: CheckoutInput;
  quote: CheckoutQuote;
}

export interface PaidResult extends Omit<PlaceResult, "failed"> {
  failed: (PlaceResult["failed"][number] & { refund: RefundOutcome })[];
  paid: number;
  paymentId: string;
  method: string;
}

/** Razorpay's prefill wants a full number; accounts store 10 digits. */
const contactFor = (phone: string) => (/^\d{10}$/.test(phone) ? `+91${phone}` : phone);

/**
 * Prices the cart, creates the Razorpay order and stores the intent.
 * @returns everything Razorpay Checkout needs to open (the key id is public by design)
 */
export async function startRazorpayCheckout(buyer: User, input: CheckoutInput) {
  const c = requireRazorpay();
  const quote = await quoteCheckout(buyer, input);
  assertPlaceable(quote);
  const id = randomUUID().replace(/-/g, "");
  const order = await createOrder(c, quote.total, id, { app: "FoodFlow", farms: String(quote.groups.length) });
  const stored: StoredCheckout = { input, quote };
  await db.paymentIntent.create({
    data: { id, buyerId: buyer.id, providerOrderId: order.id, amount: quote.total, currency: order.currency, checkout: stored as unknown as Prisma.InputJsonValue },
  });
  const items = quote.groups.reduce((n, g) => n + g.items.length, 0);
  const farms = quote.groups.length;
  return {
    keyId: c.keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    testMode: c.testMode,
    name: "FoodFlow",
    description: `${items} item${items === 1 ? "" : "s"} from ${farms} farm${farms === 1 ? "" : "s"}`,
    prefill: { name: buyer.name, email: buyer.email ?? undefined, contact: contactFor(buyer.phone), method: input.paymentMethod === "CARD" ? "card" : "upi" },
  };
}

/** Checks the browser's signed result and places the orders. */
export async function verifyRazorpayPayment(buyer: User, body: VerifyInput): Promise<PaidResult> {
  const c = requireRazorpay();
  const intent = await db.paymentIntent.findUnique({ where: { providerOrderId: body.razorpay_order_id } });
  if (!intent || intent.buyerId !== buyer.id) throw new HttpError(404, "We couldn't find that payment");
  if (!verifyPaymentSignature(c, intent.providerOrderId, body.razorpay_payment_id, body.razorpay_signature)) {
    throw new HttpError(400, "The payment signature didn't match, so nothing was placed");
  }
  return finalizeIntent(intent.id, body.razorpay_payment_id);
}

/**
 * Turns a paid intent into orders, exactly once. Razorpay is asked for the
 * payment itself: it must belong to this intent's order, be for the full
 * amount, and be captured (an authorised one is captured here).
 */
export async function finalizeIntent(intentId: string, paymentId: string): Promise<PaidResult> {
  const c = requireRazorpay();
  const intent = await db.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent) throw new HttpError(404, "We couldn't find that payment");

  if (intent.status === "CREATED") {
    let p: RazorpayPayment = await fetchPayment(c, paymentId);
    if (p.order_id !== intent.providerOrderId || p.amount !== toPaise(intent.amount) || p.currency !== intent.currency) {
      throw new HttpError(400, "This payment doesn't match your order, so nothing was placed");
    }
    if (p.status === "authorized") {
      const id = p.id;
      // Two callers can race to capture; the loser just reads the captured payment.
      p = await capturePayment(c, id, p.amount).catch(() => fetchPayment(c, id));
    }
    if (p.status !== "captured") throw new HttpError(402, p.error_description || "Razorpay hasn't confirmed this payment yet");

    const method = describeMethod(p, c.testMode);
    const paidAt = new Date();
    const groupId = randomUUID();
    const claimed = await db.paymentIntent.updateMany({
      where: { id: intent.id, status: "CREATED" },
      data: { status: "PAID", providerPaymentId: p.id, paidAt, method, groupId, failureReason: null },
    });
    if (claimed.count === 1) return placePaid({ ...intent, status: "PAID", providerPaymentId: p.id, paidAt, method, groupId });
  }
  return readPaid(intent.id, paymentId);
}

async function placePaid(intent: PaymentIntent & { providerPaymentId: string; paidAt: Date; method: string; groupId: string }): Promise<PaidResult> {
  const { input, quote } = intent.checkout as unknown as StoredCheckout;
  const buyer = await db.user.findUnique({ where: { id: intent.buyerId } });
  if (!buyer) throw new HttpError(404, "Buyer not found");
  let result: PlaceResult;
  try {
    // The buyer paid the quoted prices, so orders are placed from the stored quote.
    result = await placeQuote(buyer, input, quote, {
      groupId: intent.groupId,
      gateway: { provider: "RAZORPAY", orderId: intent.providerOrderId, paymentId: intent.providerPaymentId, method: intent.method, paidAt: intent.paidAt },
    });
  } catch (e) {
    await db.paymentIntent.update({ where: { id: intent.id }, data: { failureReason: `Paid, but placing the orders failed: ${(e as Error).message}` } });
    throw e;
  }
  const failed: PaidResult["failed"] = [];
  for (const f of result.failed) failed.push({ ...f, refund: await refundGatewayPayment(f.orderId, f.reason) });
  return { ...result, failed, paid: intent.amount, paymentId: intent.providerPaymentId, method: intent.method };
}

/** The orders a finalised intent placed (waits briefly if the other caller is still placing them). */
async function readPaid(intentId: string, paymentId: string): Promise<PaidResult> {
  for (let attempt = 0; ; attempt++) {
    const intent = await db.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.status !== "PAID" || !intent.groupId || !intent.providerPaymentId) {
      throw new HttpError(409, intent?.failureReason ?? "This payment couldn't be completed");
    }
    if (intent.providerPaymentId !== paymentId) throw new HttpError(409, "This order was already paid with another payment");
    const { quote } = intent.checkout as unknown as StoredCheckout;
    const orders = await db.order.findMany({
      where: { groupId: intent.groupId },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true, farmerId: true, total: true, status: true, cancelReason: true, farmer: { select: { name: true } }, payment: { select: { status: true, failureReason: true } } },
    });
    const settled = orders.length >= quote.groups.length && orders.every((o) => o.status !== "PLACED" && o.payment?.failureReason !== REFUND_DUE_NOTE);
    if (settled || attempt >= 20) {
      const placed = orders.filter((o) => o.status !== "CANCELLED");
      return {
        groupId: intent.groupId,
        placed: placed.map((o) => ({ id: o.id, code: o.code, farmerId: o.farmerId, farmerName: o.farmer.name, total: o.total })),
        failed: orders
          .filter((o) => o.status === "CANCELLED")
          .map((o) => ({ orderId: o.id, farmerId: o.farmerId, farmerName: o.farmer.name, total: o.total, reason: o.cancelReason ?? "Cancelled", refund: o.payment?.status === "REFUNDED" ? "refunded" : "pending" })),
        total: round2(placed.reduce((s, o) => s + o.total, 0)),
        paid: intent.amount,
        paymentId: intent.providerPaymentId,
        method: intent.method ?? "Razorpay",
      };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Notes a failed attempt on an intent still waiting for payment (the buyer can retry in the same checkout). */
export async function recordFailedAttempt(providerOrderId: string, reason: string) {
  await db.paymentIntent.updateMany({ where: { providerOrderId, status: "CREATED" }, data: { failureReason: reason.slice(0, 300) } });
}
