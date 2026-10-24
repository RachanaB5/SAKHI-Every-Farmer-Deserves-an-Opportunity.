// Phone + PIN sign-in form (works for every role).
"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await sendJSON<{ redirect: string; user: { name: string } }>("/api/auth/login", { phone, pin });
      toast.success(`Welcome back, ${res.user.name.split(" ")[0]}`);
      const n = safeNext(next);
      router.push(n && n.startsWith(res.redirect) ? n : res.redirect);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

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
        <Label htmlFor="pin">PIN</Label>
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
