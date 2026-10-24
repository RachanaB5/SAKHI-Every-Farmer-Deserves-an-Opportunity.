// Buyer's handover panel: generate/regenerate the 6-digit OTP (and, for
// self-pickup, the signed QR) and show it with an expiry countdown. The
// plaintext code exists only here (sessionStorage until it expires) — the
// server stores an HMAC. Self-pickup buyers also tell the farmer they're
// on the way and when they've arrived.
"use client";

import { Bike, KeyRound, Loader2, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendJSON } from "@/lib/fetcher";
import type { SerializedOrder } from "@/lib/orders/queries";

interface OtpData {
  otp: string;
  expiresAt: string;
  qr: { token: string; dataUrl: string } | null;
}

const key = (id: string) => `ff-otp:${id}`;
const noop = () => () => {};

function readStored(id: string): OtpData | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    if (!raw) return null;
    const v = JSON.parse(raw) as OtpData;
    return new Date(v.expiresAt) > new Date() ? v : null;
  } catch {
    return null;
  }
}

/** Whether this order currently needs a handover code from the buyer. */
export function needsHandover(o: SerializedOrder) {
  if (o.fulfilment === "PICKUP") return o.status === "READY_FOR_PICKUP";
  return (o.status === "PACKED" && Boolean(o.delivery?.worker)) || o.status === "OUT_FOR_DELIVERY";
}

/** OTP/QR card shown on the buyer's tracking page. */
export function HandoverPanel({ order, onChange }: { order: SerializedOrder; onChange: () => void }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [data, setData] = useState<OtpData | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stored = mounted ? readStored(order.id) : null;
  const current = data ?? stored;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function generate() {
    setBusy(true);
    try {
      const d = await sendJSON<OtpData>(`/api/orders/${order.id}/otp`);
      sessionStorage.setItem(key(order.id), JSON.stringify(d));
      setData(d);
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const [arriving, setArriving] = useState<"coming" | "here" | null>(null);
  async function arrive(stage: "coming" | "here") {
    setArriving(stage);
    try {
      const r = await sendJSON<{ already: boolean; etaMin: number | null }>(`/api/orders/${order.id}/arrival`, { stage });
      toast.success(stage === "coming" ? `We told the farmer you'll be there in about ${r.etaMin} minutes` : "We told the farmer you're here. Show them your code.");
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setArriving(null);
    }
  }

  const left = current ? Math.max(0, new Date(current.expiresAt).getTime() - now) : 0;
  const expired = Boolean(current) && left === 0;
  const pickup = order.fulfilment === "PICKUP";
  const here = Boolean(order.delivery?.arrivedAt);
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);

  return (
    <section className="relative overflow-hidden rounded-3xl border-2 border-lime bg-card p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="size-5" />
        <p className="font-semibold">{pickup ? "Pickup code" : "Delivery code"}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {pickup ? "Show the QR or tell the farmer this code when you collect." : "Give this code to the rider only once the order is in your hands."}
      </p>

      {pickup && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => arrive("coming")} disabled={arriving !== null || here}>
            {arriving === "coming" ? <Loader2 className="animate-spin" /> : <Bike />} {order.delivery?.farmEta ? "On my way ✓" : "I'm on my way"}
          </Button>
          <Button variant="outline" onClick={() => arrive("here")} disabled={arriving !== null || here}>
            {arriving === "here" ? <Loader2 className="animate-spin" /> : <MapPin />} {here ? "Farmer told ✓" : "I'm at the farm"}
          </Button>
        </div>
      )}

      {!current || expired ? (
        <Button size="lg" variant="brand" className="mt-4 w-full" onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} {expired ? "Code expired, get a new one" : `Show ${pickup ? "QR & code" : "OTP"}`}
        </Button>
      ) : (
        <div className="mt-4">
          {pickup && current.qr && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto mb-4 w-fit rounded-2xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- server-generated data URL */}
              <img src={current.qr.dataUrl} alt="Pickup QR code" className="size-48" />
            </motion.div>
          )}
          <div className="flex justify-center gap-1.5 sm:gap-2" aria-label={`Code ${current.otp.split("").join(" ")}`}>
            <AnimatePresence mode="popLayout">
              {current.otp.split("").map((d, i) => (
                <motion.span
                  key={`${current.otp}-${i}`}
                  initial={{ rotateX: 90, opacity: 0 }}
                  animate={{ rotateX: 0, opacity: 1 }}
                  transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 20 }}
                  className="tabular grid h-14 w-11 place-items-center rounded-xl bg-foreground font-mono text-3xl font-semibold text-background sm:h-16 sm:w-12"
                >
                  {d}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <ShieldCheck className="size-4" /> Expires in{" "}
              <span className="tabular font-semibold text-foreground">
                {mins}:{String(secs).padStart(2, "0")}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={generate} disabled={busy}>
              <RefreshCw className={busy ? "animate-spin" : ""} /> New code
            </Button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full bg-lime" animate={{ width: `${(left / (15 * 60_000)) * 100}%` }} transition={{ ease: "linear" }} />
          </div>
          {(order.delivery?.otpAttempts ?? 0) > 0 && (
            <p className="mt-2 text-xs text-warning">
              {order.delivery?.otpAttempts} wrong attempt{order.delivery?.otpAttempts === 1 ? "" : "s"} so far, generate a new code if you didn&apos;t share it.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
