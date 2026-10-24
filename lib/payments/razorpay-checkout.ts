// Browser side of Razorpay Checkout: loads checkout.js once and opens
// Razorpay's payment window for an order the server created. Resolves with
// the signed result to send to /api/payments/razorpay/verify, or with why
// the buyer left (closed the window, possibly after failed attempts).
"use client";

export interface RazorpayStart {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  testMode: boolean;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string; method?: "upi" | "card" };
}

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export type CheckoutOutcome = { paid: RazorpaySuccess } | { dismissed: true; lastError: string | null };

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (r: { error?: { description?: string; reason?: string } }) => void): void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<RazorpayCtor> | null = null;

const ctor = () => (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;

/** Loads checkout.js (once per page). */
export function loadRazorpay(): Promise<RazorpayCtor> {
  const ready = ctor();
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      const c = ctor();
      if (c) resolve(c);
      else reject(new Error("Razorpay didn't load, please try again"));
    };
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("Couldn't reach Razorpay, check your connection and try again"));
    };
    document.body.appendChild(s);
  });
  return loading;
}

/**
 * Opens Razorpay Checkout and waits for the buyer.
 * @param start - the order the server created (/api/payments/razorpay/order)
 */
export async function openRazorpay(start: RazorpayStart): Promise<CheckoutOutcome> {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve) => {
    let lastError: string | null = null;
    const rzp = new Razorpay({
      key: start.keyId,
      order_id: start.orderId,
      amount: start.amount,
      currency: start.currency,
      name: start.name,
      description: start.description,
      prefill: start.prefill,
      theme: { color: "#2a3a2e" },
      handler: (r: RazorpaySuccess) => resolve({ paid: r }),
      modal: { ondismiss: () => resolve({ dismissed: true, lastError }), confirm_close: true },
    });
    // Razorpay keeps its window open after a failed attempt so the buyer can retry.
    rzp.on("payment.failed", (r) => {
      lastError = r.error?.description ?? "The payment didn't go through";
    });
    rzp.open();
  });
}
