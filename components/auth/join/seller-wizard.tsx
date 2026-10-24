// Seller onboarding: a six-screen guided setup, not one long form.
//   1 who you are · 2 what you grow and how much · 3 who you sell to
//   4 getting it to buyers · 5 pricing and payments · 6 verification and PIN
// Answers are saved on this device as you go (never the PIN), so a farmer can
// stop and come back. Nothing about bank accounts is asked here: payouts are
// set up later through a payment provider's own secure flow. The account is
// created, and the answers stored as structured preferences, on the last
// screen. Picking ಕನ್ನಡ or हिंदी shows the screens in that language, and
// Sakhi can talk the seller through every question.
"use client";

import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { GuideBanner, GuideBar, useSignupGuide, type GuideValues } from "@/components/assistant/signup-guide";
import { Choices, Question, Toggle } from "@/components/auth/join/choices";
import { AreaField, Field, LanguageField, PinField, SelectField, TextField } from "@/components/auth/join/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssistantLang } from "@/lib/assistant/intents";
import { startJourney } from "@/lib/assistant/journey";
import { CHOICES, choiceLabel, type DisplayField } from "@/lib/assistant/signup-script";
import { CROPS, CROP_SLUGS, cropName } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";
import { joinText } from "@/lib/i18n/seller-join";
import { normalisePhone } from "@/lib/validators/common";
import {
  ALLOCATION, AVAILABILITY, BUYER_TYPES, BULK_PRICING, CAPACITY, DELIVERY_FEE, ENTITY_TYPES, FULFILMENT, ORDER_SIZES,
  OWNERSHIP, PACKING, PAYMENT_METHODS, PAYOUT, PRICING, PRODUCT_CATEGORIES, RADIUS, SELLER_TYPES, SHORTAGE, STORAGE,
  SUPPLY_SOURCE, VEHICLE, type Option,
} from "@/lib/onboarding-options";
import { cn } from "@/lib/utils";

interface Draft {
  sellerType: string; businessName: string; contactName: string; phone: string; language: string;
  state: string; district: string; village: string; pincode: string; addressLine: string; area: string; ownership: string;
  categories: string[]; crops: string[]; source: string; capacity: string; availability: string; storage: string[];
  buyerTypes: string[]; orderSizes: string; allocation: string; minOrderKg: string; negotiable: boolean; recurring: boolean; surplusAlerts: boolean;
  fulfilment: string[]; vehicle: string; radius: string; deliveryFee: string; packing: string; prepNoticeHours: string;
  pricing: string; bulkPricing: string; advanceOrders: boolean; shortage: string; paymentMethods: string[]; payoutPreference: string;
  entityType: string; fssaiNumber: string; fssaiExpiry: string; authorised: boolean; accurate: boolean; agreeTerms: boolean;
}

const EMPTY: Draft = {
  sellerType: "", businessName: "", contactName: "", phone: "", language: "kn",
  state: "Karnataka", district: "", village: "", pincode: "", addressLine: "", area: "", ownership: "",
  categories: [], crops: [], source: "", capacity: "", availability: "", storage: [],
  buyerTypes: [], orderSizes: "", allocation: "AI_ASSIST", minOrderKg: "", negotiable: false, recurring: false, surplusAlerts: true,
  fulfilment: [], vehicle: "NO", radius: "", deliveryFee: "", packing: "", prepNoticeHours: "12",
  pricing: "BOTH", bulkPricing: "FIXED", advanceOrders: false, shortage: "PARTIAL", paymentMethods: [], payoutPreference: "LATER",
  entityType: "", fssaiNumber: "", fssaiExpiry: "", authorised: false, accurate: false, agreeTerms: false,
};

const STEPS = ["About you", "Your produce", "Your buyers", "Delivery", "Pricing & payment", "Verify & finish"] as const;
const DRAFT_KEY = "foodflow.seller-draft.v1";
const subscribeNever = () => () => {};
/** The saved draft's JSON, or null (also null on the server and when storage is unavailable). */
function readDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}
const toLang = (l: string): AssistantLang => (l === "en" || l === "hi" ? l : "kn");

/** What must be filled in before moving on from each screen (null = OK). */
function check(step: number, d: Draft, pin: string, google: boolean): string | null {
  const need = (cond: unknown, msg: string) => (cond ? null : msg);
  switch (step) {
    case 0:
      return (
        need(d.sellerType, "Choose who you are selling as") ??
        need(d.businessName.trim().length >= 2, "Enter your farm or business name") ??
        need(d.contactName.trim().length >= 2, "Enter the contact person's name") ??
        need(/^[6-9]\d{9}$/.test(normalisePhone(d.phone)), "Enter a 10-digit mobile number") ??
        need(d.district.trim() && d.village.trim(), "Enter your district and town or village") ??
        need(/^\d{6}$/.test(d.pincode), "Enter a 6-digit PIN code") ??
        need(d.addressLine.trim().length >= 4, "Enter the farm or collection-point address") ??
        need(d.area, "Choose your nearest service area") ??
        need(d.ownership, "Tell us how you hold the land or source the produce")
      );
    case 1:
      return need(d.categories.length, "Pick at least one kind of produce") ?? need(d.source, "Where does your produce come from?") ?? need(d.capacity, "Choose your typical weekly supply") ?? need(d.availability, "How often is your produce available?");
    case 2:
      return need(d.buyerTypes.length, "Pick at least one kind of buyer") ?? need(d.orderSizes, "Choose the order sizes you are comfortable with");
    case 3:
      return need(d.fulfilment.length, "Choose how buyers can receive the produce") ?? need(d.radius, "How far can you serve?") ?? need(d.deliveryFee, "Who pays the delivery fee?") ?? need(d.packing, "Who prepares and packs the order?");
    case 4:
      return need(d.paymentMethods.length, "Choose at least one way to be paid");
    default:
      return (
        need(d.entityType, "Choose how you are registered") ??
        need(d.authorised, "Please confirm you may sell this produce") ??
        need(d.accurate, "Please agree to keep availability accurate") ??
        need(d.agreeTerms, "Please accept the seller terms and privacy policy") ??
        need(google || /^\d{4,6}$/.test(pin), "Create a 4–6 digit PIN")
      );
  }
}

/**
 * @param google - a Google profile to attach (contact name is prefilled and no PIN is needed)
 */
export function SellerWizard({ google }: { google?: { name: string; email: string } | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({ ...EMPTY, contactName: google?.name ?? "" });
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The screens switch language once the seller picks one (the default stays English).
  const [langPicked, setLangPicked] = useState(false);
  const lang: AssistantLang = langPicked ? toLang(d.language) : "en";
  const tx = (text: string) => joinText(text, lang);
  // Saved progress is offered, not applied silently, so nothing is overwritten before the seller chooses.
  const saved = useSyncExternalStore(subscribeNever, readDraft, () => null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ d, step }));
    } catch {
      /* no storage: the wizard still works, it just won't remember */
    }
  }, [d, step, dirty]);

  function resume() {
    if (!saved) return;
    const parsed = JSON.parse(saved) as { d: Draft; step: number };
    setD({ ...EMPTY, ...parsed.d });
    setStep(Math.min(parsed.step, STEPS.length - 1));
    setDirty(true);
  }
  function startOver() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setDirty(true);
  }

  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => {
    setD((s) => ({ ...s, [k]: v }));
    setError(null);
    setDirty(true);
  };
  const str = (k: keyof Draft) => (v: string) => set(k as never)(v as never);
  const chooseLang = (l: string) => {
    set("language")(l);
    setLangPicked(true);
  };
  const last = step === STEPS.length - 1;
  const wantsDelivery = d.fulfilment.some((f) => f !== "PICKUP");
  const businessBuyers = d.orderSizes === "BULK" || d.orderSizes === "ALL" || d.buyerTypes.some((b) => b !== "HOUSEHOLDS");

  function go(to: number) {
    setStep(to);
    setDirty(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  /**
   * Moves on when this screen is complete; false (and the reason shown) when it isn't.
   * @param values - the answers to check, when they are newer than the last render (the voice guide)
   */
  function next(values: Draft = d): boolean {
    const problem = check(step, values, pin, Boolean(google));
    if (problem) {
      setError(problem);
      return false;
    }
    setError(null);
    if (last) void finish(values);
    else go(step + 1);
    return true;
  }

  // Sakhi can talk the seller through every question on these screens.
  const guide = useSignupGuide({
    step,
    lang: d.language,
    onLang: chooseLang,
    values: d,
    google: Boolean(google),
    pinReady: Boolean(google) || /^\d{4,6}$/.test(pin),
    error,
    onFill: (patch) => {
      setD((s) => ({ ...s, ...patch }));
      setError(null);
      setDirty(true);
    },
    // The guide's answers can be newer than this render, so it passes its own copy.
    onNext: (v: GuideValues) => next({ ...d, ...v }),
    onBack: () => go(Math.max(0, step - 1)),
  });

  async function finish(values: Draft) {
    setBusy(true);
    try {
      const res = await sendJSON<{ redirect: string }>("/api/onboarding/seller", {
        ...values,
        minOrderKg: values.minOrderKg ? Number(values.minOrderKg) : undefined,
        prepNoticeHours: Number(values.prepNoticeHours) || 12,
        fssaiNumber: values.fssaiNumber || undefined,
        fssaiExpiry: values.fssaiExpiry || undefined,
        authorised: values.authorised || undefined,
        accurate: values.accurate || undefined,
        agreeTerms: values.agreeTerms || undefined,
        pin: google ? undefined : pin,
      });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      // A voice sign-up carries straight on to listing the first harvest, in the same language.
      if (guide.active) startJourney({ lang: toLang(values.language), name: values.contactName.split(" ")[0] });
      else toast.success("You're set up. Let's list your first harvest!");
      router.push(res.redirect);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  /** Choices in the page language, with the English label underneath. */
  const loc = <V extends string>(k: keyof Draft, options: readonly Option<V>[]): readonly Option<V>[] =>
    lang === "en" || !(k in CHOICES) ? options : options.map((o) => ({ value: o.value, label: choiceLabel(k as DisplayField, o.value, lang), hint: o.label }));
  const pick = <V extends string>(k: keyof Draft, options: readonly Option<V>[], opts?: { multi?: boolean; cols?: boolean; label?: string }) => (
    <Choices options={loc(k, options)} value={d[k] as never} onChange={(v) => set(k as never)(v as never)} multi={opts?.multi} cols={opts?.cols} label={opts?.label} />
  );
  const cropOptions: Option[] = CROP_SLUGS.map((c) => (lang === "en" ? { value: c, label: CROPS[c].names.en } : { value: c, label: cropName(c, lang), hint: CROPS[c].names.en }));

  return (
    // Clip the screens' slide-in so it never flashes a horizontal scrollbar on phones.
    <div className="overflow-x-clip">
      <GuideBanner guide={guide} compact={step > 0} />
      <ol className="mb-6 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }} aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <span className={cn("block h-1.5 rounded-full", i < step ? "bg-foreground" : i === step ? "bg-lime" : "bg-muted")} />
            <span className={cn("mt-1.5 hidden text-[11px] leading-tight sm:block", i === step ? "font-semibold" : "text-muted-foreground")}>{tx(s)}</span>
          </li>
        ))}
      </ol>
      <p className="mb-5 text-sm text-muted-foreground sm:hidden">
        {tx("Step")} {step + 1} {tx("of")} {STEPS.length}: <b className="text-foreground">{tx(STEPS[step])}</b>
      </p>
      {saved && !dirty && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm">
          <span>{tx("You have a setup in progress on this device.")}</span>
          <span className="flex gap-2">
            <Button type="button" size="sm" variant="brand" onClick={resume}>
              {tx("Continue where I left off")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={startOver}>
              {tx("Start over")}
            </Button>
          </span>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} className="space-y-6">
          {step === 0 && (
            <>
              <Question label={tx("Who are you selling as?")}>{pick("sellerType", SELLER_TYPES)}</Question>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={tx("Farm or business name")} id="biz" value={d.businessName} onChange={str("businessName")} />
                <TextField label={tx("Contact person")} id="contact" autoComplete="name" value={d.contactName} onChange={str("contactName")} />
                <TextField label={tx("Mobile number")} id="phone" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" value={d.phone} onChange={str("phone")} />
                <LanguageField value={d.language} onChange={chooseLang} label={tx("Preferred language")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={tx("State")} id="state" value={d.state} onChange={str("state")} />
                <TextField label={tx("District")} id="district" value={d.district} onChange={str("district")} />
                <TextField label={tx("Town or village")} id="village" value={d.village} onChange={str("village")} />
                <TextField label={tx("PIN code")} id="pincode" inputMode="numeric" maxLength={6} value={d.pincode} onChange={(v) => set("pincode")(v.replace(/\D/g, ""))} />
              </div>
              <TextField label={tx("Farm, shop or collection-centre address")} id="addr" autoComplete="street-address" value={d.addressLine} onChange={str("addressLine")} />
              <AreaField value={d.area} onChange={str("area")} label={tx("Nearest FoodFlow service area")} id="area" servedOnly />
              <Question label={tx("How do you hold the land or source the produce?")}>{pick("ownership", OWNERSHIP, { cols: true })}</Question>
            </>
          )}

          {step === 1 && (
            <>
              <Question label={tx("What do you sell?")} hint={tx("Pick all that apply.")}>{pick("categories", PRODUCT_CATEGORIES, { multi: true, cols: true })}</Question>
              <Question label={tx("Which of these crops do you grow or supply?")} hint={tx("Optional. These appear first when you list a harvest.")}>{pick("crops", cropOptions, { multi: true, cols: true })}</Question>
              <Question label={tx("Where does your produce come from?")}>{pick("source", SUPPLY_SOURCE)}</Question>
              <Question label={tx("How much can you typically supply?")} hint={tx("A rough guide is enough. You'll enter exact quantities for each harvest.")}>{pick("capacity", CAPACITY, { cols: true })}</Question>
              <Question label={tx("How often is your produce available?")}>{pick("availability", AVAILABILITY, { cols: true })}</Question>
              <Question label={tx("What storage do you have?")} hint={tx("Optional.")}>{pick("storage", STORAGE, { multi: true, cols: true })}</Question>
            </>
          )}

          {step === 2 && (
            <>
              <Question label={tx("Who would you like to sell to?")} hint={tx("Select all that apply.")}>{pick("buyerTypes", BUYER_TYPES, { multi: true, cols: true })}</Question>
              <Question label={tx("What order sizes are you comfortable with?")}>{pick("orderSizes", ORDER_SIZES, { cols: true })}</Question>
              <Question label={tx("Who decides how your available stock is allocated?")}>{pick("allocation", ALLOCATION)}</Question>
              <Field label={tx("Minimum order quantity in kg (optional)")} id="minq">
                <Input id="minq" inputMode="decimal" value={d.minOrderKg} onChange={(e) => set("minOrderKg")(e.target.value.replace(/[^\d.]/g, ""))} className="max-w-48" />
              </Field>
              <div className="grid gap-2">
                <Toggle label={tx("I'm willing to negotiate prices with bulk buyers")} on={d.negotiable} onChange={set("negotiable")} />
                <Toggle label={tx("I'd accept recurring orders or supply contracts")} on={d.recurring} onChange={set("recurring")} />
                <Toggle label={tx("Contact me about unsold surplus if my produce isn't selling")} on={d.surplusAlerts} onChange={set("surplusAlerts")} />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Question label={tx("How can buyers receive the produce?")} hint={tx("Select all that apply.")}>{pick("fulfilment", FULFILMENT, { multi: true })}</Question>
              {wantsDelivery && <Question label={tx("Do you already have a delivery person or vehicle?")}>{pick("vehicle", VEHICLE)}</Question>}
              <Question label={tx("How far can you serve?")}>{pick("radius", RADIUS, { cols: true })}</Question>
              <Question label={tx("Who should pay the delivery fee?")}>{pick("deliveryFee", DELIVERY_FEE, { cols: true })}</Question>
              <Question label={tx("Who prepares and packs the order?")}>{pick("packing", PACKING)}</Question>
              <Field label={tx("How many hours' notice do you need to prepare an order?")} id="notice">
                <Input id="notice" inputMode="numeric" value={d.prepNoticeHours} onChange={(e) => set("prepNoticeHours")(e.target.value.replace(/\D/g, ""))} className="max-w-32" />
              </Field>
              <p className="rounded-2xl bg-muted px-4 py-3 text-sm">{tx("Delivery is only shown to buyers once a rider, a time slot and a fee are confirmed, so we never promise what can't be delivered.")}</p>
            </>
          )}

          {step === 4 && (
            <>
              <Question label={tx("How do you want to set prices?")} hint={tx("Price guidance is optional and never changes your price on its own.")}>{pick("pricing", PRICING)}</Question>
              {businessBuyers && <Question label={tx("For bulk orders, are your prices…")}>{pick("bulkPricing", BULK_PRICING, { cols: true })}</Question>}
              <Toggle label={tx("Buyers can place advance orders before harvest")} on={d.advanceOrders} onChange={set("advanceOrders")} />
              <Question label={tx("If a buyer asks for more than you have, what should happen?")}>{pick("shortage", SHORTAGE)}</Question>
              <Question label={tx("Which payment methods will you accept?")}>{pick("paymentMethods", PAYMENT_METHODS, { multi: true })}</Question>
              <Question label={tx("How would you like to receive your earnings?")}>{pick("payoutPreference", PAYOUT)}</Question>
              <div className="flex gap-3 rounded-2xl border bg-card p-4 text-sm">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
                <div className="space-y-1.5">
                  <p className="font-semibold">{tx("We don't collect bank details here.")}</p>
                  <p className="text-muted-foreground">{tx("Payout details are set up separately, through a secure payment provider, when you're ready to be paid. We will never ask for your UPI PIN, bank password, card PIN or an OTP.")}</p>
                  <p className="text-muted-foreground">{tx("FoodFlow keeps a 5% platform fee on each sale. The delivery share is shown on every order, and you are paid after the handover is verified.")}</p>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <SelectField label={tx("How are you registered?")} id="entity" value={d.entityType} onChange={str("entityType")} options={loc("entityType", ENTITY_TYPES)} placeholder={tx("Choose one")} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={tx("FSSAI registration / licence number (if you have one)")} id="fssai" maxLength={20} value={d.fssaiNumber} onChange={str("fssaiNumber")} hint={tx("Some food businesses need one. You can add it later.")} />
                <TextField label={tx("Expiry date (optional)")} id="fssaiExp" type="date" value={d.fssaiExpiry} onChange={str("fssaiExpiry")} />
              </div>
              <div className="space-y-3">
                <Check label={tx("I'm authorised to list and sell this produce on behalf of this farm or organisation.")} on={d.authorised} onChange={set("authorised")} />
                <Check label={tx("I'll keep quantities and availability accurate.")} on={d.accurate} onChange={set("accurate")} />
                <Check
                  label={
                    <>
                      {tx("I agree to the")}{" "}
                      <Link href="/terms" target="_blank" className="font-medium underline underline-offset-4">
                        {tx("seller terms")}
                      </Link>{" "}
                      {tx("and")}{" "}
                      <Link href="/privacy" target="_blank" className="font-medium underline underline-offset-4">
                        {tx("privacy policy")}
                      </Link>
                      .
                    </>
                  }
                  on={d.agreeTerms}
                  onChange={set("agreeTerms")}
                />
              </div>
              {google ? (
                <p className="rounded-2xl bg-muted px-4 py-3 text-sm">Joining with Google ({google.email}). You&apos;ll use Google to sign in next time, so there&apos;s no PIN to remember.</p>
              ) : (
                <div className="max-w-sm">
                  <PinField value={pin} onChange={(v) => { setPin(v); setError(null); }} label={tx("Create a PIN to finish")} hint={tx("You'll use your mobile number and this PIN to sign in.")} />
                </div>
              )}
              <p className="rounded-2xl bg-muted px-4 py-3 text-sm">{tx("Every harvest you list is checked by a person before buyers see it. You can change your selling preferences, delivery and payout settings any time after you join.")}</p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <p role="alert" className="mt-5 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {tx(error)}
        </p>
      )}
      <div className="mt-7 flex gap-3">
        {step > 0 && (
          <Button type="button" variant="outline" size="lg" onClick={() => go(step - 1)} disabled={busy}>
            <ArrowLeft /> {tx("Back")}
          </Button>
        )}
        <Button type="button" size="lg" variant={last ? "brand" : "default"} className="h-auto min-h-12 min-w-0 flex-1 py-2.5 leading-tight whitespace-normal" onClick={() => next()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : last ? tx("Create my seller account") : <>{tx("Next")} <ArrowRight /></>}
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {tx("Already selling with us?")}{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          {tx("Sign in")}
        </Link>
      </p>
      <GuideBar guide={guide} />
    </div>
  );
}

/** A checkbox row with rich label text. */
function Check({ label, on, onChange }: { label: React.ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 text-[15px]">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--lime)]" />
      <span>{label}</span>
    </label>
  );
}
