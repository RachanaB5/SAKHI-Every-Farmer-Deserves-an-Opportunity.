// Restaurant / hostel / community-kitchen sign-up: the business, its address,
// optional licence numbers and rough weekly volume, plus sign-in details (a
// mobile number proven with a texted code and a PIN typed twice).
// Creates a BULK_BUYER account.
"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Choices, Question } from "@/components/auth/join/choices";
import { AreaField, LanguageField, NewPinFields, SelectField, TextField, pinsReady } from "@/components/auth/join/fields";
import { PhoneVerify } from "@/components/auth/phone-verify";
import { Button } from "@/components/ui/button";
import { UNSERVED_AREAS } from "@/lib/areas";
import { sendJSON } from "@/lib/fetcher";
import { ORG_TYPES, WEEKLY_NEED } from "@/lib/onboarding-options";

/**
 * @param google - a Google profile to attach (name is prefilled and no PIN is needed)
 */
export function RestaurantForm({ google }: { google?: { name: string; email: string } | null }) {
  const router = useRouter();
  const [f, setF] = useState({ orgName: "", orgType: "RESTAURANT", contactName: google?.name ?? "", phone: "", pin: "", pin2: "", language: "en", addressLine: "", area: "", pincode: "", fssaiNumber: "", gstin: "", weeklyNeed: "" });
  const [agree, setAgree] = useState(false);
  const [verified, setVerified] = useState(false);
  const ready = verified && (Boolean(google) || pinsReady(f.pin, f.pin2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await sendJSON<{ redirect: string }>("/api/onboarding/restaurant", {
        ...f,
        pin2: undefined,
        pin: google ? undefined : f.pin,
        fssaiNumber: f.fssaiNumber || undefined,
        gstin: f.gstin || undefined,
        weeklyNeed: f.weeklyNeed || undefined,
        agreeTerms: agree ? true : undefined,
      });
      toast.success("Your kitchen is set up. Welcome to FoodFlow!");
      router.push(res.redirect);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <section className="grid gap-4 sm:grid-cols-2">
        <TextField label="Restaurant / kitchen name" id="orgName" value={f.orgName} onChange={set("orgName")} />
        <SelectField label="Type" id="orgType" value={f.orgType} onChange={set("orgType")} options={ORG_TYPES} />
        <TextField label="Contact person" id="contactName" autoComplete="name" value={f.contactName} onChange={set("contactName")} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Where should we deliver?</h2>
        <TextField label="Address" id="addressLine" autoComplete="street-address" placeholder="Building, street, landmark" value={f.addressLine} onChange={set("addressLine")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <AreaField value={f.area} onChange={set("area")} label="Area" />
          <TextField label="PIN code" id="pincode" inputMode="numeric" maxLength={6} value={f.pincode} onChange={(v) => set("pincode")(v.replace(/\D/g, ""))} />
        </div>
        {UNSERVED_AREAS.includes(f.area) && <p className="rounded-2xl bg-warning/15 px-4 py-3 text-sm">We&apos;re not delivering to {f.area} yet. You can still register and we&apos;ll tell you when we arrive.</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">About your business</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="FSSAI licence number (optional)" id="fssai" maxLength={20} value={f.fssaiNumber} onChange={set("fssaiNumber")} />
          <TextField label="GSTIN (optional)" id="gstin" maxLength={15} value={f.gstin} onChange={(v) => set("gstin")(v.toUpperCase())} />
        </div>
        <Question label="How much produce do you buy in a typical week? (optional)">
          <Choices options={WEEKLY_NEED} value={f.weeklyNeed as never} onChange={(v) => set("weeklyNeed")(v as string)} cols />
        </Question>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Sign-in details</h2>
        <PhoneVerify phone={f.phone} onPhone={set("phone")} purpose="SIGNUP" verified={verified} onVerified={setVerified} />
        {!google && <NewPinFields pin={f.pin} onPin={set("pin")} confirm={f.pin2} onConfirm={set("pin2")} />}
        <div className="sm:max-w-xs">
          <LanguageField value={f.language} onChange={set("language")} />
        </div>
      </section>

      {google && <p className="rounded-2xl bg-muted px-4 py-3 text-sm">Joining with Google ({google.email}). You&apos;ll use Google to sign in next time, so there&apos;s no PIN to remember.</p>}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 accent-[var(--lime)]" />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="font-medium underline underline-offset-4">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium underline underline-offset-4">
            privacy policy
          </Link>
          .
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !ready || !agree}>
        {busy ? <Loader2 className="animate-spin" /> : "Create account"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
