// Phone + PIN sign-in form (works for every role), with "Forgot PIN?": prove
// the number with a texted code, choose a new PIN, and you're signed in.
"use client";

import { ArrowLeft, ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { NewPinFields, pinsReady } from "@/components/auth/join/fields";
import { PhoneVerify } from "@/components/auth/phone-verify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJSON } from "@/lib/fetcher";

/** Only allow same-site relative redirects. */
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
}

/**
 * @param next - path to return to after sign-in (from the proxy redirect)
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  function arrive(res: { redirect: string; user: { name: string } }, greeting: string) {
    toast.success(`${greeting}, ${res.user.name.split(" ")[0]}`);
    const n = safeNext(next);
    router.push(n && n.startsWith(res.redirect) ? n : res.redirect);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      arrive(await sendJSON<{ redirect: string; user: { name: string } }>("/api/auth/login", { phone, pin }), "Welcome back");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  if (resetting) return <ResetPin phone={phone} onPhone={setPhone} onBack={() => setResetting(false)} onDone={(res) => arrive(res, "PIN changed. Welcome back")} />;

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Mobile number</Label>
        <div className="flex">
          <span className="grid h-11 place-items-center rounded-l-xl border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
            +91
          </span>
          <Input
            id="phone"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-l-none"
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="pin">PIN</Label>
          <button type="button" onClick={() => { setResetting(true); setError(null); }} className="text-sm font-medium underline underline-offset-4">
            Forgot PIN?
          </button>
        </div>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="4–6 digits"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={loading || !phone || pin.length < 4}>
        {loading ? <Loader2 className="animate-spin" /> : <>Sign in <ArrowRight /></>}
      </Button>
    </form>
  );
}

/** Forgot PIN: prove the number with a texted code, then set a new PIN (typed twice). */
function ResetPin({ phone, onPhone, onBack, onDone }: { phone: string; onPhone: (v: string) => void; onBack: () => void; onDone: (res: { redirect: string; user: { name: string } }) => void }) {
  const [verified, setVerified] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await sendJSON<{ redirect: string; user: { name: string } }>("/api/auth/reset-pin", { phone, pin }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <KeyRound className="mt-0.5 size-4 shrink-0" /> We&apos;ll text a code to your registered number. Then choose a new PIN.
      </p>
      <PhoneVerify phone={phone} onPhone={onPhone} purpose="RESET" verified={verified} onVerified={setVerified} />
      {verified && <NewPinFields pin={pin} onPin={setPin} confirm={confirm} onConfirm={setConfirm} label="New PIN" hint="You'll sign in with your mobile number and this PIN." />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !verified || !pinsReady(pin, confirm)}>
        {busy ? <Loader2 className="animate-spin" /> : "Save PIN and sign in"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        <ArrowLeft /> Back to sign in
      </Button>
    </form>
  );
}
