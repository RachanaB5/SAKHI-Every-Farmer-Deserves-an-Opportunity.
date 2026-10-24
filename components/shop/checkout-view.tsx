// Checkout: delivery vs self-pickup, service-area check, slot, simulated
// payment method, and a live server quote (one order per farmer). Pay →
// authorise → reserve stock → capture, then a success screen with order
// codes and tracking links.
"use client";

import { AlertTriangle, ArrowRight, CreditCard, Home, Info, Loader2, MapPin, Smartphone, Store } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { SuccessBurst } from "@/components/motion/success-burst";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SERVICE_AREAS, UNSERVED_AREAS } from "@/lib/areas";
import { ApiError, fetcher, sendJSON } from "@/lib/fetcher";
import { formatINR, formatQty } from "@/lib/format";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/utils";
import { PaymentSheet, type PayPhase } from "./payment-sheet";

interface Quote {
  area: string;
  groups: { farmerId: string; farmerName: string; village: string | null; items: { listingId: string; title: string; unit: string; qty: number; lineTotal: number }[]; subtotal: number; deliveryFee: number; total: number }[];
  issues: { listingId: string; title: string; problem: string; message: string; available?: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  blocked: { code: string; message: string } | null;
}
interface PlaceResult {
  groupId: string;
  placed: { id: string; code: string; farmerId: string; farmerName: string; total: number }[];
  failed: { farmerId: string; farmerName: string; reason: string }[];
  total: number;
}

const noop = () => () => {};

/** Next few delivery windows (today's start ≥ 2h from now). */
function slots(): string[] {
  const now = new Date();
  const h = now.getHours() + 2;
  const today = [
    [7, "7–9 AM"],
    [9, "9–11 AM"],
    [17, "5–7 PM"],
    [19, "7–9 PM"],
  ]
    .filter(([start]) => (start as number) >= h)
    .map(([, l]) => `Today ${l}`);
  return [...today, "Tomorrow 7–9 AM", "Tomorrow 9–11 AM", "Tomorrow 5–7 PM"].slice(0, 5);
}

function postQuote([url, body]: [string, string]) {
  return fetcher<Quote>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
}

/** @param profile - buyer's saved area and address for prefill */
export function CheckoutView({ profile }: { profile: { area: string | null; address: string | null } }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const removeLine = useCart((s) => s.remove);
  const removeFarmers = useCart((s) => s.removeFarmers);

  const [fulfilment, setFulfilment] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [area, setArea] = useState(profile.area ?? "Yelahanka");
  const [address, setAddress] = useState(profile.address ?? "");
  const [options] = useState(slots);
  const [slot, setSlot] = useState(options[0]);
  const [method, setMethod] = useState<"UPI" | "CARD">("UPI");
  const [phase, setPhase] = useState<PayPhase | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [result, setResult] = useState<PlaceResult | null>(null);

  const payload = { items: items.map((i) => ({ listingId: i.listingId, qty: i.qty })), fulfilment, area, addressLine: address, slot, paymentMethod: method };
  const key = mounted && items.length ? (["/api/checkout/quote", JSON.stringify(payload)] as [string, string]) : null;
  const { data: quote, error, isLoading } = useSWR<Quote, ApiError>(key, postQuote, { keepPreviousData: true, revalidateOnFocus: false });
  const outOfArea = Boolean(quote?.blocked);

  async function pay() {
    if (!quote) return;
    setPayError(null);
    setPhase("authorising");
    // The authorisation step is simulated client-side for the demo; the server
    // records the AUTHORISED payment and captures only after stock is reserved.
    await new Promise((r) => setTimeout(r, 900));
    setPhase("reserving");
    try {
      const res = await sendJSON<PlaceResult>("/api/checkout", payload);
      await new Promise((r) => setTimeout(r, 600));
      setPhase("done");
      removeFarmers(res.placed.map((p) => p.farmerId));
      await new Promise((r) => setTimeout(r, 700));
      setPhase(null);
      setResult(res);
    } catch (e) {
      setPayError((e as Error).message);
      setPhase("error");
    }
  }

  if (!mounted) return null;
  if (result) return <Success result={result} />;
  if (!items.length) {
    return (
      <div>
        <PageHeader title="Checkout" />
        <p className="text-muted-foreground">
          Your cart is empty. <Link href="/shop" className="underline">Browse produce</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader title="*Checkout*" back={{ href: "/shop/cart", label: "Cart" }} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="How do you want it?">
            <div className="grid grid-cols-2 gap-3">
              {[
                { v: "DELIVERY" as const, icon: Home, t: "Doorstep delivery", s: "Rider verifies with OTP" },
                { v: "PICKUP" as const, icon: Store, t: "Self-pickup", s: "Collect at the farm point" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setFulfilment(o.v)}
                  className={cn("relative rounded-2xl border p-4 text-left transition-colors", fulfilment === o.v ? "border-foreground" : "hover:bg-muted/50")}
                >
                  {fulfilment === o.v && <motion.span layoutId="ful-pill" className="absolute inset-0 -z-10 rounded-2xl bg-lime/25" />}
                  <o.icon className="size-5" />
                  <p className="mt-2 text-sm font-semibold">{o.t}</p>
                  <p className="text-xs text-muted-foreground">{o.s}</p>
                </button>
              ))}
            </div>
          </Section>

          {fulfilment === "DELIVERY" ? (
            <Section title="Deliver to">
              <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="area">Area</Label>
                  <Select value={area} onValueChange={setArea}>
                    <SelectTrigger id="area" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_AREAS.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.name}
                        </SelectItem>
                      ))}
                      {UNSERVED_AREAS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="addr">House / street</Label>
                  <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat, building, street" autoComplete="street-address" />
                </div>
              </div>
              {outOfArea && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex gap-3 rounded-2xl border border-warning/40 bg-warning/12 p-4 text-sm">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-warning" />
                  <div>
                    <p>{quote?.blocked?.message}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setFulfilment("PICKUP")}>
                      Switch to self-pickup
                    </Button>
                  </div>
                </motion.div>
              )}
            </Section>
          ) : (
            <Section title="Pickup">
              <p className="rounded-2xl bg-muted/60 p-4 text-sm">
                Collect from each farm&apos;s pickup point. Show your <b>pickup QR</b> or tell the farmer your <b>OTP</b>, it appears on the order page once it&apos;s packed.
              </p>
            </Section>
          )}

          <Section title={fulfilment === "DELIVERY" ? "Delivery slot" : "Pickup window"}>
            <div className="flex flex-wrap gap-2">
              {options.map((s) => (
                <button key={s} type="button" onClick={() => setSlot(s)} className={cn("min-h-11 rounded-full border px-4 text-sm", slot === s && "border-foreground bg-foreground text-background")}>
                  {s}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Pay with">
            <div className="grid grid-cols-2 gap-3">
              {[
                { v: "UPI" as const, icon: Smartphone, t: "UPI" },
                { v: "CARD" as const, icon: CreditCard, t: "Card" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setMethod(o.v)}
                  className={cn("flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-sm font-medium", method === o.v && "border-foreground bg-muted/60")}
                >
                  <o.icon className="size-5" /> {o.t}
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">demo</span>
                </button>
              ))}
            </div>
          </Section>
        </div>

        <aside className="h-fit space-y-4 rounded-3xl border bg-card p-5 lg:sticky lg:top-8">
          <p className="font-semibold">Order summary</p>
          {isLoading && !quote && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          {quote?.issues.map((iss) => (
            <div key={iss.listingId} className="flex gap-2 rounded-xl bg-warning/12 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="min-w-0">
                <p>{iss.message}</p>
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold underline"
                  onClick={() => (iss.problem === "short" && iss.available ? setQty(iss.listingId, iss.available) : removeLine(iss.listingId))}
                >
                  {iss.problem === "short" && iss.available ? `Use ${iss.available}` : "Remove"}
                </button>
              </div>
            </div>
          ))}
          {quote?.groups.map((g) => (
            <div key={g.farmerId} className="rounded-2xl bg-muted/40 p-3">
              <p className="text-sm font-medium">{g.farmerName}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {g.items.map((i) => (
                  <li key={i.listingId} className="flex justify-between gap-2">
                    <span>
                      {i.title} × {formatQty(i.qty, i.unit)}
                    </span>
                    <span className="tabular">{formatINR(i.lineTotal)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2">
                  <span>{fulfilment === "PICKUP" ? "Pickup" : "Delivery"}</span>
                  <span className="tabular">{g.deliveryFee ? formatINR(g.deliveryFee) : "Free"}</span>
                </li>
              </ul>
            </div>
          ))}
          {quote && !quote.blocked && (
            <div className="space-y-1.5 border-t pt-3 text-sm">
              <Row k="Items" v={formatINR(quote.subtotal, true)} />
              <Row k="Delivery" v={quote.deliveryFee ? formatINR(quote.deliveryFee, true) : "Free"} />
              <Row k="Platform fee" v="₹0 for you" />
              <div className="flex justify-between pt-1 text-base font-semibold">
                <span>Total</span>
                <span className="tabular">{formatINR(quote.total, true)}</span>
              </div>
            </div>
          )}
          <p className="flex gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            We authorise the amount now and capture it only once each farm&apos;s stock is reserved. Farmers are paid after delivery is verified.
          </p>
          <div className="glass fixed inset-x-0 bottom-0 z-30 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <Button size="lg" variant="brand" className="w-full" onClick={pay} disabled={!quote || Boolean(quote.issues.length) || outOfArea || phase !== null}>
              Pay {quote ? formatINR(quote.total, true) : ""} <ArrowRight />
            </Button>
          </div>
        </aside>
      </div>
      <PaymentSheet phase={phase} amount={quote ? formatINR(quote.total, true) : ""} error={payError} onClose={() => setPhase(null)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
}

function Success({ result }: { result: PlaceResult }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-8 text-center">
      <SuccessBurst />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        Order{result.placed.length > 1 ? "s" : ""} <span className="font-serif font-normal italic">placed</span>
      </h1>
      <p className="mt-2 max-w-sm text-muted-foreground">
        {formatINR(result.total, true)} captured, your farmers are packing. Track each order live.
      </p>
      <div className="mt-6 w-full max-w-md space-y-2">
        {result.placed.map((p) => (
          <Link key={p.id} href={`/shop/orders/${p.id}`} className="flex items-center justify-between rounded-2xl border bg-card p-4 text-left hover:border-foreground/30">
            <span>
              <span className="block font-mono text-sm font-semibold">{p.code}</span>
              <span className="text-xs text-muted-foreground">{p.farmerName}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-medium">
              Track <ArrowRight className="size-4" />
            </span>
          </Link>
        ))}
        {result.failed.map((f) => (
          <div key={f.farmerId} className="flex gap-2 rounded-2xl bg-warning/12 p-4 text-left text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              <b>{f.farmerName}:</b> {f.reason}. That part wasn&apos;t charged, it&apos;s still in your cart.
            </span>
          </div>
        ))}
      </div>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/shop/orders">All orders</Link>
      </Button>
    </motion.div>
  );
}
