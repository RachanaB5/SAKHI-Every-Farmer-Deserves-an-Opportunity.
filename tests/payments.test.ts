// Razorpay checkout against a stand-in Razorpay API (fetch is stubbed):
// signatures, intent → orders only after a verified payment, exactly-once
// placement when verify and the webhook race, capture of authorised
// payments, refunds for stock that ran out after payment and for
// cancellations, and the simulated fallback when no keys are set.
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { cancelOrder } from "@/lib/orders/lifecycle";
import { finalizeIntent, startRazorpayCheckout, verifyRazorpayPayment } from "@/lib/payments/checkout";
import { describeMethod, razorpayPublic, toPaise, verifyPaymentSignature, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { POST as webhook } from "@/app/api/payments/razorpay/webhook/route";
import { makeListing, makeUser } from "./helpers";

const KEY_ID = "rzp_test_FAKEKEY123";
const SECRET = "test_secret_abc";
const WEBHOOK_SECRET = "whsec_test_123";
const API = "https://api.razorpay.test/v1";

/** A minimal in-memory Razorpay: orders, payments, capture and partial refunds. */
const fake = {
  n: 0,
  orders: new Map<string, { id: string; amount: number; currency: string; receipt: string }>(),
  payments: new Map<string, { id: string; order_id: string; amount: number; currency: string; status: string; method: string; refunded: number }>(),
  refunds: [] as { id: string; payment_id: string; amount: number }[],
  failRefunds: false,
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const error = (status: number, description: string) => json(status, { error: { code: "BAD_REQUEST_ERROR", description } });

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (!url.startsWith(API)) throw new Error(`unexpected fetch ${url}`);
  const auth = new Headers(init?.headers).get("authorization");
  if (auth !== `Basic ${Buffer.from(`${KEY_ID}:${SECRET}`).toString("base64")}`) return error(401, "Authentication failed");
  const path = url.slice(API.length);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (init?.method === "POST" && path === "/orders") {
    const order = { id: `order_${++fake.n}`, amount: body.amount, currency: body.currency, receipt: body.receipt, status: "created" };
    fake.orders.set(order.id, order);
    return json(200, order);
  }
  const m = path.match(/^\/payments\/([^/]+)(\/capture|\/refund)?$/);
  const p = m && fake.payments.get(decodeURIComponent(m[1]));
  if (!m || !p) return error(400, "The id provided does not exist");
  if (!m[2]) return json(200, p);
  if (m[2] === "/capture") {
    if (p.status !== "authorized") return error(400, "This payment has already been captured");
    p.status = "captured";
    return json(200, p);
  }
  if (fake.failRefunds) return error(400, "The amount must be at least INR 1.00");
  if (p.status !== "captured" || p.refunded + body.amount > p.amount) return error(400, "The refund amount provided is greater than amount captured");
  p.refunded += body.amount;
  const refund = { id: `rfnd_${++fake.n}`, payment_id: p.id, amount: body.amount, status: "processed" };
  fake.refunds.push(refund);
  return json(200, refund);
}

/** The buyer pays a Razorpay order; returns what Checkout hands the browser. */
function pay(orderId: string, opts: { status?: "captured" | "authorized"; amount?: number } = {}) {
  const order = fake.orders.get(orderId)!;
  const id = `pay_${++fake.n}`;
  fake.payments.set(id, { id, order_id: orderId, amount: opts.amount ?? order.amount, currency: "INR", status: opts.status ?? "captured", method: "upi", refunded: 0 });
  const razorpay_signature = createHmac("sha256", SECRET).update(`${orderId}|${id}`).digest("hex");
  return { razorpay_order_id: orderId, razorpay_payment_id: id, razorpay_signature };
}

let buyer: Awaited<ReturnType<typeof makeUser>>;
let farmerA: string;
let farmerB: string;

beforeAll(async () => {
  await db.category.upsert({ where: { slug: "vegetables" }, create: { slug: "vegetables", name: "Vegetables", enabledAreas: [] }, update: {} });
  buyer = await makeUser("CONSUMER", { address: "12 Test Road", email: `buyer-${Date.now()}@example.com` });
  farmerA = (await makeUser("FARMER")).id;
  farmerB = (await makeUser("FARMER")).id;
  vi.stubGlobal("fetch", fakeFetch);
});

beforeEach(() => {
  Object.assign(process.env, { RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET, RAZORPAY_API_BASE: API });
  fake.failRefunds = false;
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_API_BASE"]) delete process.env[k];
});

const cart = (lines: { listingId: string; qty: number }[]) => ({ items: lines, fulfilment: "PICKUP" as const, slot: "Tomorrow 9–11 AM", paymentMethod: "UPI" as const });
const ordersOf = (buyerId: string) => db.order.findMany({ where: { buyerId }, include: { payment: true } });

describe("Razorpay signatures", () => {
  it("accepts Razorpay's checkout signature and rejects a tampered one", () => {
    const sig = createHmac("sha256", SECRET).update("order_1|pay_1").digest("hex");
    expect(verifyPaymentSignature({ keySecret: SECRET }, "order_1", "pay_1", sig)).toBe(true);
    expect(verifyPaymentSignature({ keySecret: SECRET }, "order_1", "pay_2", sig)).toBe(false);
    expect(verifyPaymentSignature({ keySecret: SECRET }, "order_1", "pay_1", "nope")).toBe(false);
  });

  it("checks webhook bodies byte for byte", () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    expect(verifyWebhookSignature(WEBHOOK_SECRET, body, sig)).toBe(true);
    expect(verifyWebhookSignature(WEBHOOK_SECRET, `${body} `, sig)).toBe(false);
  });

  it("names the method and the mode", () => {
    expect(describeMethod({ method: "upi" }, true)).toBe("UPI via Razorpay (test mode)");
    expect(describeMethod({ method: "netbanking", bank: "hdfc" }, false)).toBe("Netbanking (HDFC) via Razorpay");
  });
});

describe("Razorpay checkout", () => {
  it("opens a Razorpay order for the server-priced total and places nothing yet", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 10, 40);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 2 }]));
    expect(start).toMatchObject({ keyId: KEY_ID, currency: "INR", testMode: true, name: "FoodFlow", amount: toPaise(80) });
    expect(start.prefill).toMatchObject({ contact: `+91${shopper.phone}`, method: "upi" });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { providerOrderId: start.orderId } });
    expect(intent).toMatchObject({ status: "CREATED", amount: 80, buyerId: shopper.id });
    expect(await ordersOf(shopper.id)).toHaveLength(0);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).availableQty).toBe(10);
  });

  it("places the orders once Razorpay confirms the payment, with Razorpay's ids on them", async () => {
    const listing = await makeListing(farmerA, 10, 30);
    const start = await startRazorpayCheckout(buyer, cart([{ listingId: listing.id, qty: 3 }]));
    const paid = pay(start.orderId);
    const res = await verifyRazorpayPayment(buyer, paid);
    expect(res.placed).toHaveLength(1);
    expect(res.failed).toHaveLength(0);
    expect(res).toMatchObject({ paid: 90, total: 90, paymentId: paid.razorpay_payment_id, method: "UPI via Razorpay (test mode)" });

    const order = await db.order.findUniqueOrThrow({ where: { id: res.placed[0].id }, include: { payment: true } });
    expect(order.status).toBe("CONFIRMED");
    expect(order.payment).toMatchObject({
      status: "CAPTURED",
      provider: "RAZORPAY",
      providerOrderId: start.orderId,
      providerPaymentId: paid.razorpay_payment_id,
      ref: paid.razorpay_payment_id,
      method: "UPI via Razorpay (test mode)",
    });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).availableQty).toBe(7);
    expect(await db.paymentIntent.findUniqueOrThrow({ where: { providerOrderId: start.orderId } })).toMatchObject({ status: "PAID", groupId: res.groupId });
  });

  it("places orders exactly once when the browser and the webhook report the same payment together", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 10, 30);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 1 }]));
    const paid = pay(start.orderId);
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { providerOrderId: start.orderId } });
    const [a, b, c] = await Promise.all([
      verifyRazorpayPayment(shopper, paid),
      verifyRazorpayPayment(shopper, paid),
      finalizeIntent(intent.id, paid.razorpay_payment_id),
    ]);
    expect(new Set([a.groupId, b.groupId, c.groupId]).size).toBe(1);
    expect(a.placed.map((p) => p.id)).toEqual(b.placed.map((p) => p.id));
    expect(await ordersOf(shopper.id)).toHaveLength(1);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).availableQty).toBe(9);
  });

  it("rejects a forged signature and places nothing", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 5);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 1 }]));
    const paid = pay(start.orderId);
    await expect(verifyRazorpayPayment(shopper, { ...paid, razorpay_signature: "0".repeat(64) })).rejects.toMatchObject({ status: 400 });
    expect(await ordersOf(shopper.id)).toHaveLength(0);
  });

  it("won't let another buyer claim someone's payment", async () => {
    const listing = await makeListing(farmerA, 5);
    const start = await startRazorpayCheckout(buyer, cart([{ listingId: listing.id, qty: 1 }]));
    const thief = await makeUser("CONSUMER");
    await expect(verifyRazorpayPayment(thief, pay(start.orderId))).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a payment for a different amount than the order", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 5, 30);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 2 }]));
    await expect(verifyRazorpayPayment(shopper, pay(start.orderId, { amount: 100 }))).rejects.toMatchObject({ status: 400 });
    expect(await ordersOf(shopper.id)).toHaveLength(0);
    expect((await db.paymentIntent.findUniqueOrThrow({ where: { providerOrderId: start.orderId } })).status).toBe("CREATED");
  });

  it("captures a payment that Razorpay only authorised", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 5, 30);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 1 }]));
    const paid = pay(start.orderId, { status: "authorized" });
    const res = await verifyRazorpayPayment(shopper, paid);
    expect(res.placed).toHaveLength(1);
    expect(fake.payments.get(paid.razorpay_payment_id)?.status).toBe("captured");
  });

  it("refunds a farm's share through Razorpay when its stock ran out after payment", async () => {
    const shopper = await makeUser("CONSUMER");
    const a = await makeListing(farmerA, 10, 30);
    const b = await makeListing(farmerB, 2, 50);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: a.id, qty: 2 }, { listingId: b.id, qty: 2 }]));
    expect(start.amount).toBe(toPaise(160));
    // Someone else buys farmer B's last stock while this buyer is paying.
    await db.listing.update({ where: { id: b.id }, data: { availableQty: 0, status: "SOLD_OUT" } });
    const paid = pay(start.orderId);
    const res = await verifyRazorpayPayment(shopper, paid);

    expect(res.placed.map((p) => p.farmerId)).toEqual([farmerA]);
    expect(res.failed).toMatchObject([{ farmerId: farmerB, total: 100, refund: "refunded" }]);
    const refund = fake.refunds.find((r) => r.payment_id === paid.razorpay_payment_id);
    expect(refund?.amount).toBe(toPaise(100));
    const lost = await db.order.findUniqueOrThrow({ where: { id: res.failed[0].orderId }, include: { payment: true } });
    expect(lost.status).toBe("CANCELLED");
    expect(lost.payment).toMatchObject({ status: "REFUNDED", providerRefundId: refund?.id, failureReason: null });
  });

  it("refunds a cancelled order through Razorpay", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 10, 30);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 2 }]));
    const paid = pay(start.orderId);
    const res = await verifyRazorpayPayment(shopper, paid);
    await cancelOrder(res.placed[0].id, shopper.id, "Changed my mind");

    const order = await db.order.findUniqueOrThrow({ where: { id: res.placed[0].id }, include: { payment: true } });
    expect(order.status).toBe("CANCELLED");
    expect(order.payment?.status).toBe("REFUNDED");
    expect(fake.refunds.find((r) => r.id === order.payment?.providerRefundId)).toMatchObject({ payment_id: paid.razorpay_payment_id, amount: toPaise(60) });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).availableQty).toBe(10);
  });

  it("keeps a refund Razorpay rejected marked as owed, never as done", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 10, 30);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 1 }]));
    const res = await verifyRazorpayPayment(shopper, pay(start.orderId));
    fake.failRefunds = true;
    await cancelOrder(res.placed[0].id, shopper.id, "Changed my mind");
    const payment = await db.payment.findUniqueOrThrow({ where: { orderId: res.placed[0].id } });
    expect(payment.status).toBe("CAPTURED");
    expect(payment.refundedAt).toBeNull();
    expect(payment.failureReason).toMatch(/^Refund owed/);
  });
});

describe("Razorpay webhook", () => {
  const send = (body: string, signature: string) =>
    webhook(new NextRequest("http://localhost/api/payments/razorpay/webhook", { method: "POST", body, headers: { "content-type": "application/json", "x-razorpay-signature": signature } }));

  it("places a paid checkout whose buyer closed the tab", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 10, 30);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 1 }]));
    const paid = pay(start.orderId);
    const body = JSON.stringify({ entity: "event", event: "payment.captured", payload: { payment: { entity: { id: paid.razorpay_payment_id, order_id: start.orderId } } } });
    const res = await send(body, createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { handled: true } });
    const orders = await ordersOf(shopper.id);
    expect(orders).toHaveLength(1);
    expect(orders[0].payment?.provider).toBe("RAZORPAY");
  });

  it("notes a failed attempt without placing anything", async () => {
    const shopper = await makeUser("CONSUMER");
    const listing = await makeListing(farmerA, 10, 30);
    const start = await startRazorpayCheckout(shopper, cart([{ listingId: listing.id, qty: 1 }]));
    const body = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_x", order_id: start.orderId, error_description: "Payment was declined by the bank" } } } });
    const res = await send(body, createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"));
    expect(res.status).toBe(200);
    expect(await db.paymentIntent.findUniqueOrThrow({ where: { providerOrderId: start.orderId } })).toMatchObject({ status: "CREATED", failureReason: "Payment was declined by the bank" });
    expect(await ordersOf(shopper.id)).toHaveLength(0);
  });

  it("rejects an unsigned or wrongly signed event", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    expect((await send(body, "bad")).status).toBe(400);
    expect((await send(body, createHmac("sha256", "other-secret").update(body).digest("hex"))).status).toBe(400);
  });
});

describe("without Razorpay keys", () => {
  it("stays on the simulated payment and refuses to open a Razorpay order", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(razorpayPublic()).toBeNull();
    const listing = await makeListing(farmerA, 5);
    await expect(startRazorpayCheckout(buyer, cart([{ listingId: listing.id, qty: 1 }]))).rejects.toMatchObject({ status: 503 });
  });
});
