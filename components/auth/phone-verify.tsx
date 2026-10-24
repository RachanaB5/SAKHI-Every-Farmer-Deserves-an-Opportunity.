// Proves a mobile number with a texted 6-digit code (sign-up and PIN reset):
// number → "Send code" → code (checked as soon as 6 digits are typed) →
// "Verified". When the server has no SMS provider (development / labelled
// demos) the code is shown on screen instead.
"use client";

import { CheckCircle2, Loader2, MessageSquareText, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalisePhone } from "@/lib/validators/common";
import { sendJSON } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

const identity = (s: string) => s;

/**
 * @param purpose - SIGNUP (the number must be new) or RESET (it must have an account)
 * @param verified - controlled: whether this number is proven
 * @param onVerified - called with true once the code is right, false when the number changes
 * @param tx - translator for the labels (seller wizard); English by default
 */
export function PhoneVerify({
  phone,
  onPhone,
  purpose,
  verified,
  onVerified,
  tx = identity,
  label = "Mobile number",
}: {
  phone: string;
  onPhone: (v: string) => void;
  purpose: "SIGNUP" | "RESET";
  verified: boolean;
  onVerified: (v: boolean) => void;
  tx?: (s: string) => string;
  label?: string;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const valid = /^[6-9]\d{9}$/.test(normalisePhone(phone));

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function change(v: string) {
    onPhone(v);
    if (verified || sentTo) {
      onVerified(false);
      setSentTo(null);
      setCode("");
      setDemoCode(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      const r = await sendJSON<{ resendInSeconds: number; demoCode?: string }>("/api/auth/phone/send", { phone, purpose });
      setSentTo(normalisePhone(phone));
      setWait(r.resendInSeconds);
      setDemoCode(r.demoCode ?? null);
      setCode("");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setError(tx((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function check(value: string) {
    setBusy("check");
    setError(null);
    try {
      await sendJSON("/api/auth/phone/verify", { phone, purpose, code: value });
      onVerified(true);
    } catch (e) {
      setError(tx((e as Error).message));
      setCode("");
    } finally {
      setBusy(null);
    }
  }

  if (verified) {
    return (
      <div className="space-y-1.5">
        <Label>{tx(label)}</Label>
        <div className="flex h-11 items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          <span className="tabular font-medium">+91 {normalisePhone(phone)}</span>
          <span className="text-success">{tx("Verified")}</span>
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => change(phone)}>
            <Pencil /> {tx("Change")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`phone-${purpose}`}>{tx(label)}</Label>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1">
          <span className="grid h-11 place-items-center rounded-l-xl border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">+91</span>
          <Input
            id={`phone-${purpose}`}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => change(e.target.value)}
            className="rounded-l-none"
          />
        </div>
        <Button type="button" variant={sentTo ? "outline" : "default"} onClick={send} disabled={!valid || busy !== null || wait > 0}>
          {busy === "send" ? <Loader2 className="animate-spin" /> : <MessageSquareText />}
          {wait > 0 ? `${wait}s` : sentTo ? tx("Resend") : tx("Send code")}
        </Button>
      </div>
      {sentTo && (
        <div className="space-y-1.5 rounded-2xl bg-muted/60 p-3">
          <Label htmlFor={`code-${purpose}`} className="text-sm">
            {tx("Enter the 6-digit code we sent to")} <span className="tabular">+91 {sentTo}</span>
          </Label>
          <Input
            ref={codeRef}
            id={`code-${purpose}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            disabled={busy === "check"}
            className={cn("tabular max-w-40 text-center text-lg tracking-[0.4em]")}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) check(v);
            }}
          />
          {demoCode && (
            <p className="text-xs text-muted-foreground">
              {tx("Demo: text messages aren't connected, so here is your code:")} <b className="tabular text-foreground">{demoCode}</b>
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
