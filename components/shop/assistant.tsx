// AI grocery assistant: snap/speak/type a shopping list → editable items →
// smart basket (best farm per item with a reason, alternatives to swap) →
// add everything to the cart in one tap.
"use client";

import { ArrowRight, Camera, ChevronDown, ImagePlus, Keyboard, Loader2, Mic, Plus, ShoppingBasket, Sparkles, Trash2, Wand2 } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AISourceBadge } from "@/components/ai/ai-labels";
import { MediaImage } from "@/components/common/media-image";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MicOrb } from "@/components/voice/mic-orb";
import { SPEECH_LANGS, useSpeech } from "@/hooks/use-speech";
import type { BasketPick, WantedItem } from "@/lib/basket";
import { cropName } from "@/lib/crops";
import { sendForm, sendJSON } from "@/lib/fetcher";
import { formatINR, formatQty } from "@/lib/format";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/utils";

type Mode = "photo" | "speak" | "type";
interface Parsed {
  items: WantedItem[];
  source: "ai" | "fallback";
  sample: boolean;
}
interface BasketResult {
  picks: BasketPick[];
  farms: number;
  estimate: number;
  unmatched: string[];
}
type Pick = NonNullable<BasketPick["best"]>;

const UNITS = ["kg", "litre", "dozen", "piece"];

/** The /shop/assistant experience. */
export function GroceryAssistant() {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const [mode, setMode] = useState<Mode>("photo");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en-IN");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [items, setItems] = useState<WantedItem[]>([]);
  const [basket, setBasket] = useState<BasketResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  function accept(p: Parsed) {
    setParsed(p);
    setItems(p.items);
    setBasket(null);
    if (!p.items.length) toast("We couldn't find any items, add them below.");
  }

  async function parseImage(file: File) {
    setPreview(URL.createObjectURL(file));
    setParsing(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const started = Date.now();
      const p = await sendForm<Parsed>("/api/ai/parse-grocery-list", form);
      await new Promise((r) => setTimeout(r, Math.max(0, 1600 - (Date.now() - started))));
      accept(p);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function parseText(t: string) {
    setParsing(true);
    try {
      accept(await sendJSON<Parsed>("/api/ai/parse-grocery-list", { text: t }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  const speech = useSpeech((said) => {
    setText(said);
    parseText(said);
  });

  async function build() {
    const clean = items.filter((i) => i.name.trim() && i.qty > 0);
    if (!clean.length) return toast.error("Add at least one item");
    setBuilding(true);
    try {
      const b = await sendJSON<BasketResult>("/api/basket/match", { items: clean });
      setBasket(b);
      setChoice({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  const chosen = (i: number): Pick | null => {
    const p = basket?.picks[i];
    if (!p?.best) return null;
    const id = choice[i];
    return [p.best, ...p.alternatives].find((x) => x.id === id) ?? p.best;
  };
  const chosenList = basket?.picks.map((_, i) => chosen(i)).filter(Boolean) as Pick[] | undefined;
  const total = chosenList?.reduce((s, c) => s + c.price * c.qty, 0) ?? 0;
  const farms = new Set(chosenList?.map((c) => c.farmer.id)).size;

  function addAll() {
    for (const c of chosenList ?? []) {
      add(
        { listingId: c.id, title: c.title, crop: c.crop, unit: c.unit, price: c.price, minQty: c.minOrderQty, maxQty: c.availableQty, farmerId: c.farmer.id, farmerName: c.farmer.name, imageUrl: c.imageUrl, area: c.area },
        c.qty,
      );
    }
    toast.success(`${chosenList?.length} items added to your cart`);
    router.push("/shop/cart");
  }

  return (
    <div className="pb-28 lg:pb-8">
      <PageHeader
        title="Your list → a *smart basket*"
        description="Snap a handwritten list, say it, or type it. We find the best farm for each item, and you choose."
      />

      {!basket && (
        <>
          <LayoutGroup id="assist-mode">
            <div className="grid grid-cols-3 gap-2 rounded-2xl border p-1">
              {[
                { k: "photo" as const, icon: Camera, l: "Photo" },
                { k: "speak" as const, icon: Mic, l: "Speak" },
                { k: "type" as const, icon: Keyboard, l: "Type" },
              ].map((m) => (
                <button key={m.k} type="button" onClick={() => setMode(m.k)} className={cn("relative flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium", mode === m.k ? "text-background" : "text-muted-foreground")}>
                  {mode === m.k && <motion.span layoutId="assist-pill" className="absolute inset-0 -z-10 rounded-xl bg-foreground" />}
                  <m.icon className="size-4" /> {m.l}
                </button>
              ))}
            </div>
          </LayoutGroup>

          <div className="mt-4">
            {mode === "photo" && (
              <div className="relative overflow-hidden rounded-3xl border border-dashed bg-card p-5">
                {preview ? (
                  <div className="relative mx-auto aspect-[3/4] max-h-80 overflow-hidden rounded-2xl bg-muted">
                    <MediaImage src={preview} className="object-contain" />
                    {parsing && (
                      <>
                        <div className="bg-grid absolute inset-0 opacity-60 mix-blend-overlay" />
                        <span className="absolute inset-x-0 h-0.5 animate-scan bg-lime shadow-[0_0_18px_4px_var(--lime)]" />
                      </>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-lime/30">
                      <ShoppingBasket className="size-8" />
                    </span>
                    <p className="mt-3 font-semibold">Photo of your shopping list</p>
                    <p className="text-sm text-muted-foreground">Handwritten is fine. English or Indian languages.</p>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Button variant="brand" size="lg" onClick={() => camRef.current?.click()} disabled={parsing}>
                    <Camera /> Camera
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => fileRef.current?.click()} disabled={parsing}>
                    <ImagePlus /> Upload
                  </Button>
                </div>
                {parsing && (
                  <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Reading your list…
                  </p>
                )}
                <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && parseImage(e.target.files[0])} />
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && parseImage(e.target.files[0])} />
              </div>
            )}
            {mode === "speak" && (
              <div className="dark relative overflow-hidden rounded-3xl bg-background p-5 text-foreground">
                <span className="absolute -top-16 -right-12 size-52 animate-orb rounded-full bg-lime/20 blur-3xl" />
                <div className="relative flex flex-wrap gap-2">
                  {SPEECH_LANGS.map((l) => (
                    <button key={l.code} type="button" onClick={() => setLang(l.code)} className={cn("h-9 rounded-full border px-3 text-sm", lang === l.code ? "border-lime bg-lime text-lime-foreground" : "border-white/15 text-muted-foreground")}>
                      {l.label}
                    </button>
                  ))}
                </div>
                <div className="relative flex flex-col items-center">
                  <MicOrb listening={speech.listening} onClick={() => (speech.listening ? speech.stop() : speech.start(lang))} disabled={!speech.supported || parsing} label="Dictate your list" />
                  <p className="-mt-3 min-h-12 max-w-md text-center">
                    {speech.listening ? speech.interim || "Listening…" : parsing ? "Reading…" : !speech.supported ? "Voice isn't supported in this browser, use Type." : speech.error ?? "e.g. “two kilo onion, one kilo tomato, milk two litre”"}
                  </p>
                </div>
              </div>
            )}
            {mode === "type" && (
              <div className="space-y-3">
                <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"2 kg onion\n1 kg tomato\nmilk 2 L\npalak"} />
                <Button variant="brand" size="lg" onClick={() => parseText(text)} disabled={parsing || text.trim().length < 2}>
                  {parsing ? <Loader2 className="animate-spin" /> : <Wand2 />} Read my list
                </Button>
              </div>
            )}
          </div>

          <AnimatePresence>
            {parsed && (
              <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-3xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">Your list</p>
                  <AISourceBadge source={parsed.source} />
                </div>
                {parsed.sample && (
                  <p className="mt-3 rounded-2xl bg-warning/12 p-3 text-sm">
                    Reading photos needs the AI service, which isn&apos;t configured here, so this is a <b>sample list</b>. Edit it, or switch to Type/Speak.
                  </p>
                )}
                <ul className="mt-3 space-y-2">
                  <AnimatePresence initial={false}>
                    {items.map((it, i) => (
                      <motion.li key={i} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-b pb-2 last:border-0 sm:grid-cols-[1fr_80px_100px_auto] sm:border-0 sm:pb-0">
                        <Input aria-label="Item" className="col-span-3 sm:col-span-1" value={it.name} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                        <Input aria-label="Quantity" inputMode="decimal" value={String(it.qty)} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)))} className="px-2 text-center" />
                        <select aria-label="Unit" value={it.unit} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} className="h-11 rounded-xl border border-input bg-background/60 px-2 text-base">
                          {UNITS.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                        <Button variant="ghost" size="icon" aria-label="Remove item" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setItems((xs) => [...xs, { name: "", qty: 1, unit: "kg" }])}>
                  <Plus /> Add item
                </Button>
                <Button size="lg" variant="brand" className="mt-4 w-full" onClick={build} disabled={building}>
                  {building ? <Loader2 className="animate-spin" /> : <Sparkles />} Build my smart basket
                </Button>
              </motion.section>
            )}
          </AnimatePresence>
        </>
      )}

      {basket && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="dark mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-background p-5 text-foreground">
            <div>
              <p className="text-sm text-muted-foreground">Smart basket</p>
              <p className="text-2xl font-semibold">
                {chosenList?.length} items · {farms} farm{farms === 1 ? "" : "s"}
              </p>
            </div>
            <Button variant="outline" onClick={() => setBasket(null)} className="border-white/20">
              Edit list
            </Button>
          </div>
          <ul className="space-y-3">
            {basket.picks.map((p, i) => (
              <PickRow key={i} pick={p} current={chosen(i)} onChoose={(id) => setChoice((c) => ({ ...c, [i]: id }))} index={i} />
            ))}
          </ul>
          {chosenList && chosenList.length > 0 && (
            <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md lg:static lg:mx-0 lg:mt-6 lg:max-w-none">
              <Button size="lg" variant="brand" className="h-14 w-full text-base shadow-xl" onClick={addAll}>
                Add {chosenList.length} items to cart · {formatINR(total)} <ArrowRight />
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function PickRow({ pick, current, onChoose, index }: { pick: BasketPick; current: Pick | null; onChoose: (id: string) => void; index: number }) {
  const [open, setOpen] = useState(false);
  const label = `${formatQty(pick.item.qty, pick.item.unit)} ${pick.crop ? cropName(pick.crop) : pick.item.name}`;
  if (!pick.best || !current) {
    return (
      <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="rounded-3xl border border-dashed p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>, not on FoodFlow right now.
      </motion.li>
    );
  }
  const options = [pick.best, ...pick.alternatives];
  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className="overflow-hidden rounded-3xl border bg-card">
      <div className="flex gap-3 p-3 sm:p-4">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-muted">{current.imageUrl && <MediaImage src={current.imageUrl} sizes="64px" />}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">You asked for {label}</p>
          <p className="font-semibold break-words">
            {current.farmer.name} <span className="font-normal text-muted-foreground">· {current.farmer.village}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="tabular font-medium">
              {formatQty(current.qty, current.unit)} × {formatINR(current.price)} = {formatINR(current.qty * current.price)}
            </span>
            <span className="rounded-full bg-lime/35 px-2 py-0.5 text-xs font-medium">{current.reason}</span>
          </div>
        </div>
      </div>
      {pick.alternatives.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between border-t px-4 text-sm text-muted-foreground hover:bg-muted/40">
            {open ? "Hide options" : `${pick.alternatives.length} other farm${pick.alternatives.length > 1 ? "s" : ""}`}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ul initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t">
                {options.map((o) => (
                  <li key={o.id}>
                    <button type="button" onClick={() => onChoose(o.id)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40", o.id === current.id && "bg-lime/15")}>
                      <span className={cn("size-4 shrink-0 rounded-full border-2", o.id === current.id ? "border-foreground bg-foreground" : "border-muted-foreground/40")} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium break-words">
                          {o.farmer.name} · {formatINR(o.price)}/{o.unit}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {o.reason} · ~{o.etaHours ?? "?"} h · score {o.score}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.li>
  );
}
