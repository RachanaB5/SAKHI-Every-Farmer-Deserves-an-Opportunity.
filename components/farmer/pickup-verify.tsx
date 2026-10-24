// Farmer pickup counter: scan the buyer's QR or type order code + OTP.
// Lists orders waiting for collection. Success marks the order COLLECTED
// and creates the pending payout.
"use client";

import { Keyboard, PackageCheck, ScanLine } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { OtpKeypad } from "@/components/delivery/otp-keypad";
import { QrScanner } from "@/components/delivery/qr-scanner";
import { SuccessBurst } from "@/components/motion/success-burst";
import { useI18n } from "@/components/providers/i18n-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { useLive } from "@/hooks/use-live";
import { cropName } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";
import { formatINR, formatQty } from "@/lib/format";
import type { SerializedOrder } from "@/lib/orders/queries";
import { cn } from "@/lib/utils";

type Result = { code: string; ok: true; already: boolean; settlementNet?: number } | { code: string; ok: false; message: string };

/** /farmer/pickup */
export function PickupVerify() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [mode, setMode] = useState<"scan" | "code">(params.get("code") ? "code" : "scan");
  const [code, setCode] = useState((params.get("code") ?? "").replace(/^FF-/, ""));
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [done, setDone] = useState<{ code: string; net?: number } | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const { data: waiting, mutate } = useSWR<SerializedOrder[]>("/api/orders?status=READY_FOR_PICKUP");
  useLive(["order.updated"], () => mutate());

  async function submit(payload: { qrToken: string } | { code: string; otp: string }) {
    setBusy(true);
    setErr(null);
    try {
      const r = await sendJSON<Result>("/api/pickups/verify", payload);
      if (r.ok) {
        navigator.vibrate?.([40, 60, 40]);
        setDone({ code: r.code, net: r.settlementNet });
        setOtp("");
        mutate();
      } else {
        setErr(r.message);
        setShake((s) => s + 1);
        setOtp("");
        if ("qrToken" in payload) setScanKey((k) => k + 1);
      }
    } catch (e) {
      setErr((e as Error).message);
      setShake((s) => s + 1);
      setOtp("");
      if ("qrToken" in payload) {
        toast.error((e as Error).message);
        setScanKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("pickup.title")} description={t("pickup.desc")} />

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center rounded-3xl border bg-card p-8 text-center">
            <SuccessBurst />
            <p className="mt-6 text-2xl font-semibold">{t("pickup.collected", { code: done.code })}</p>
            {done.net !== undefined && <p className="mt-1 text-muted-foreground">{t("pickup.addedPending", { amount: formatINR(done.net, true) })}</p>}
            <Button size="lg" className="mt-6" onClick={() => { setDone(null); setCode(""); setScanKey((k) => k + 1); }}>
              {t("pickup.next")}
            </Button>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LayoutGroup id="pickup-mode">
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border p-1">
                {[
                  { k: "scan" as const, icon: ScanLine, l: t("pickup.scan") },
                  { k: "code" as const, icon: Keyboard, l: t("pickup.codeOtp") },
                ].map((m) => (
                  <button key={m.k} type="button" onClick={() => setMode(m.k)} className={cn("relative flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium", mode === m.k ? "text-background" : "text-muted-foreground")}>
                    {mode === m.k && <motion.span layoutId="pickup-pill" className="absolute inset-0 -z-10 rounded-xl bg-foreground" />}
                    <m.icon className="size-4" /> {m.l}
                  </button>
                ))}
              </div>
            </LayoutGroup>
            {mode === "scan" ? (
              <div>
                <QrScanner key={scanKey} onResult={(text) => submit({ qrToken: text })} />
                {err && <p className="mt-3 text-center text-sm text-destructive">{err}</p>}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex h-14 items-center rounded-2xl border-2 px-4 focus-within:border-lime">
                  <span className="font-mono text-xl text-muted-foreground">FF-</span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                    placeholder={t("pickup.codePh")}
                    aria-label={t("pickup.orderCode")}
                    className="min-w-0 flex-1 bg-transparent font-mono text-xl tracking-[0.3em] uppercase outline-none"
                  />
                </label>
                <OtpKeypad value={otp} onChange={(v) => { setOtp(v); setErr(null); }} onSubmit={(o) => (code.length === 5 ? submit({ code: `FF-${code}`, otp: o }) : setErr(t("pickup.enterCodeFirst")))} busy={busy} shakeKey={shake} error={err} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t("pickup.waiting")}</h2>
        {waiting?.length ? (
          <ul className="space-y-2">
            {waiting.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => { setMode("code"); setCode(o.code.replace("FF-", "")); setOtp(""); }} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left hover:border-foreground/30">
                  <PackageCheck className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono font-semibold">{o.code}</span>
                    <span className="block text-sm break-words text-muted-foreground">
                      {o.buyer.name} · {o.items.map((i) => `${i.crop ? cropName(i.crop, lang) : i.title} ${formatQty(i.qty, i.unit, lang)}`).join(", ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("pickup.none")}</p>
        )}
      </section>
    </div>
  );
}
