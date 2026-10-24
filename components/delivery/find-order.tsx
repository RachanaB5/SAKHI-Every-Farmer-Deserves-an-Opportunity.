// Rider "find order": type the code, scan the packing-label QR, or say it.
// Finding only OPENS the run — handover still needs the customer's OTP.
"use client";

import { Keyboard, Loader2, Mic, ScanLine } from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { MicOrb } from "@/components/voice/mic-orb";
import { useSpeech } from "@/hooks/use-speech";
import { normaliseNumbers } from "@/lib/ai/fallback/numbers";
import { fetcher } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { QrScanner } from "./qr-scanner";

type Mode = "type" | "scan" | "speak";

/** Pulls an order code out of free text, a URL, or a QR payload. */
function extractCode(raw: string): string {
  const up = normaliseNumbers(raw).toUpperCase();
  const m = up.match(/FF[-\s]?([A-Z0-9]{5})/);
  if (m) return m[1];
  return up.replace(/[^A-Z0-9]/g, "").replace(/^FF/, "").slice(0, 5);
}

/** /delivery/find */
export function FindOrder() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("type");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function open(raw: string) {
    const c = extractCode(raw);
    if (c.length < 5) return toast.error("That doesn't look like an order code");
    setBusy(true);
    try {
      const r = await fetcher<{ orderId: string }>(`/api/deliveries/find?code=FF-${c}`);
      router.push(`/delivery/${r.orderId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  const speech = useSpeech((said) => {
    setCode(extractCode(said));
    open(said);
  });

  return (
    <div>
      <PageHeader title="Find an *order*" back={{ href: "/delivery", label: "Runs" }} />
      <LayoutGroup id="find-mode">
        <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border p-1">
          {[
            { k: "type" as const, icon: Keyboard, l: "Type" },
            { k: "scan" as const, icon: ScanLine, l: "Scan" },
            { k: "speak" as const, icon: Mic, l: "Speak" },
          ].map((m) => (
            <button key={m.k} type="button" onClick={() => setMode(m.k)} className={cn("relative flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium", mode === m.k ? "text-background" : "text-muted-foreground")}>
              {mode === m.k && <motion.span layoutId="find-pill" className="absolute inset-0 -z-10 rounded-xl bg-foreground" />}
              <m.icon className="size-4" /> {m.l}
            </button>
          ))}
        </div>
      </LayoutGroup>

      {mode === "type" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            open(code);
          }}
          className="space-y-4"
        >
          <label className="flex h-16 items-center rounded-2xl border-2 px-4 focus-within:border-lime">
            <span className="font-mono text-2xl text-muted-foreground">FF-</span>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
              placeholder="7K2QA"
              aria-label="Order code"
              autoCapitalize="characters"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent font-mono text-2xl tracking-[0.3em] uppercase outline-none"
            />
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 5}>
            {busy ? <Loader2 className="animate-spin" /> : "Open order"}
          </Button>
        </form>
      )}
      {mode === "scan" && (
        <div>
          <QrScanner onResult={open} />
          <p className="mt-3 text-center text-sm text-muted-foreground">Point at the QR on the farmer&apos;s packing label.</p>
        </div>
      )}
      {mode === "speak" && (
        <div className="flex flex-col items-center">
          <MicOrb listening={speech.listening} onClick={() => (speech.listening ? speech.stop() : speech.start("en-IN"))} disabled={!speech.supported || busy} label="Say the order code" />
          <p className="-mt-2 min-h-12 text-center text-muted-foreground">
            {speech.listening ? speech.interim || "Listening…" : !speech.supported ? "Voice isn't supported here, type the code." : speech.error ?? "Say the 5 characters after FF, e.g. “seven K two Q A”."}
          </p>
        </div>
      )}
      <p className="mt-6 rounded-2xl bg-muted/60 p-3 text-center text-xs text-muted-foreground">Finding an order only opens it. It&apos;s marked delivered only with the customer&apos;s OTP.</p>
    </div>
  );
}
