// Household sign-up: just the sign-in details (name, mobile, PIN), language
// and an optional delivery address. Creates a CONSUMER account.
"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AreaField, LanguageField, PinField, TextField } from "@/components/auth/join/fields";
import { Button } from "@/components/ui/button";
import { UNSERVED_AREAS } from "@/lib/areas";
import { sendJSON } from "@/lib/fetcher";

/**
 * @param google - a Google profile to attach (name is prefilled and no PIN is needed)
 */
export function HouseholdForm({ google }: { google?: { name: string; email: string } | null }) {
  const router = useRouter();
  const [f, setF] = useState({ name: google?.name ?? "", phone: "", pin: "", language: "en", area: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await sendJSON<{ redirect: string }>("/api/auth/register", {
        name: f.name,
        phone: f.phone,
        pin: google ? undefined : f.pin,
        role: "CONSUMER",
        language: f.language,
        area: f.area,
        address: f.address || undefined,
      });
      toast.success("Welcome to FoodFlow!");
      router.push(res.redirect);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" id="name" autoComplete="name" value={f.name} onChange={set("name")} />
        <TextField label="Mobile number" id="phone" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" value={f.phone} onChange={set("phone")} />
        {!google && <PinField value={f.pin} onChange={set("pin")} />}
        <LanguageField value={f.language} onChange={set("language")} />
        <AreaField value={f.area} onChange={set("area")} label="Where should we deliver?" />
        <TextField label="Street / landmark (optional)" id="address" autoComplete="street-address" value={f.address} onChange={set("address")} />
      </div>
      {google && <p className="rounded-2xl bg-muted px-4 py-3 text-sm">Joining with Google ({google.email}). You&apos;ll use Google to sign in next time, so there&apos;s no PIN to remember.</p>}
      {UNSERVED_AREAS.includes(f.area) && (
        <p className="rounded-2xl bg-warning/15 px-4 py-3 text-sm">We&apos;re not delivering to {f.area} yet. You can still sign up and browse, and you&apos;ll be first to know when we arrive.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : "Create account"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
