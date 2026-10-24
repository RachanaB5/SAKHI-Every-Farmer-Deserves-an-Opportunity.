// Razorpay gateway: create an order, check a payment's signature, fetch,
// capture and refund it, and verify webhooks. Plain REST with Basic auth
// (no SDK). With no keys in the environment the gateway is off and
// checkout keeps its labelled simulated payment.
//
// Test Mode keys (rzp_test_…) are free and move no real money; live keys
// need a KYC-verified Razorpay account.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/api";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  testMode: boolean;
  apiBase: string;
}

/** The gateway settings, or null when no keys are configured. */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null,
    testMode: keyId.startsWith("rzp_test_"),
    // Overridable so tests and local E2E runs can point at a stand-in server.
    apiBase: (process.env.RAZORPAY_API_BASE?.trim() || "https://api.razorpay.com/v1").replace(/\/$/, ""),
  };
}

/** What the checkout page may know: whether Razorpay is on, and in which mode. Never the secret. */
export function razorpayPublic(): { provider: "razorpay"; testMode: boolean } | null {
  const c = razorpayConfig();
  return c && { provider: "razorpay", testMode: c.testMode };
}

/** The config, or 503 when the gateway isn't set up. */
export function requireRazorpay(): RazorpayConfig {
  const c = razorpayConfig();
  if (!c) throw new HttpError(503, "Online payment isn't set up on this server");
  return c;
}

/** Rupees → paise, the unit Razorpay amounts are in. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method: string;
  vpa?: string | null;
  bank?: string | null;
  wallet?: string | null;
  error_description?: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

async function call<T>(c: RazorpayConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${c.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.keyId}:${c.keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, "Couldn't reach Razorpay, please try again");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: { description?: string } }) | null;
  if (!res.ok || !json) {
    const why = json?.error?.description;
    if (res.status === 401) throw new HttpError(502, "Razorpay rejected the API keys, check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
    throw new HttpError(502, why ? `Razorpay: ${why}` : `Razorpay returned an error (${res.status})`);
  }
  return json;
}

/**
 * Creates a Razorpay order for `amount` rupees.
 * @param receipt - our reference (max 40 chars), shown in the Razorpay dashboard
 */
export function createOrder(c: RazorpayConfig, amount: number, receipt: string, notes: Record<string, string> = {}) {
  return call<RazorpayOrder>(c, "POST", "/orders", { amount: toPaise(amount), currency: "INR", receipt: receipt.slice(0, 40), notes });
}

export function fetchPayment(c: RazorpayConfig, paymentId: string) {
  return call<RazorpayPayment>(c, "GET", `/payments/${encodeURIComponent(paymentId)}`);
}

/** Captures an authorised payment (accounts set to manual capture need this). */
export function capturePayment(c: RazorpayConfig, paymentId: string, amountPaise: number) {
  return call<RazorpayPayment>(c, "POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" });
}

/** Refunds `amount` rupees of a captured payment (partial refunds allowed). */
export function refundPayment(c: RazorpayConfig, paymentId: string, amount: number, notes: Record<string, string> = {}) {
  return call<RazorpayRefund>(c, "POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: toPaise(amount), notes });
}

function sameHex(expected: string, given: string) {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout's success signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function verifyPaymentSignature(c: Pick<RazorpayConfig, "keySecret">, orderId: string, paymentId: string, signature: string) {
  const expected = createHmac("sha256", c.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return sameHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(secret: string, rawBody: string, signature: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sameHex(expected, signature);
}

const METHOD_NAMES: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emi: "EMI", paylater: "Pay later", cardless_emi: "Cardless EMI" };

/** "UPI via Razorpay (test mode)", "Netbanking (HDFC) via Razorpay". */
export function describeMethod(p: Pick<RazorpayPayment, "method" | "bank" | "wallet">, testMode: boolean) {
  const name = METHOD_NAMES[p.method] ?? p.method;
  const detail = p.method === "netbanking" ? p.bank : p.method === "wallet" ? p.wallet : null;
  return `${name}${detail ? ` (${detail.toUpperCase()})` : ""} via Razorpay${testMode ? " (test mode)" : ""}`;
}
