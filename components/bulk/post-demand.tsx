// Post a bulk requirement three ways: a form, by voice (AI fills the
// form for review), or from a procurement list (photo/text → several
// requirements at once). Urgent and recurring toggles included.
"use client";

import { Flame, Keyboard, ListChecks, Loader2, Mic, Plus, Repeat, Send, Trash2, Wand2 } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AISourceBadge } from "@/components/ai/ai-labels";
import { QtyStepper } from "@/components/common/qty-stepper";
import { CropPicker } from "@/components/farmer/new-batch/crop-picker";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MicOrb } from "@/components/voice/mic-orb";
import { SPEECH_LANGS, useSpeech } from "@/hooks/use-speech";
import { CROP_SLUGS, cropName, isCropSlug, matchCrop, type CropSlug } from "@/lib/crops";
import { fetcher, sendForm, sendJSON } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

type Mode = "form" | "voice" | "list";
type Grade = "ANY" | "A" | "B" | "C";
interface Draft {
  crop: CropSlug | null;
  qtyKg: string;
  grade: Grade;
  targetPrice: string;
  deadline: string; // datetime-local value
  urgent: boolean;
  recurring: boolean;
  frequency: "DAILY" | "WEEKLY";
  notes: string;
}

/** datetime-local string `days` from today at `hour`:00. */
function at(days: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DEADLINES = [
  { label: "Tomorrow 7 AM", value: () => at(1, 7) },
  { label: "Tomorrow 10 AM", value: () => at(1, 10) },
  { label: "In 2 days", value: () => at(2, 9) },
  { label: "In 3 days", value: () => at(3, 9) },
];

/** Blank draft; the deadline is computed when the form opens. */
const emptyDraft = (): Draft => ({ crop: null, qtyKg: "50", grade: "ANY", targetPrice: "", deadline: at(1, 10), urgent: false, recurring: false, frequency: "WEEKLY", notes: "" });

/** /bulk/demands/new */
export function PostDemand() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("form");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceInfo, setVoiceInfo] = useState<{ transcript: string; source: string } | null>(null);
  const set = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setMissing((m) => m.filter((k) => !(k in p) && !(k === "qtyKg" && "qtyKg" in p)));
  };

  // Market hint for the chosen crop (indicative).
  const { data: market } = useSWR(draft.crop ? ["/api/ai/price-advice", draft.crop] : null, ([u, crop]: [string, string]) =>
    fetcher<{ modalToday: number; suggested: number; mandi: string }>(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crop }) }),
  );

  async function submit() {
    const gaps = [!draft.crop && "crop", !(Number(draft.qtyKg) > 0) && "qtyKg", !(Number(draft.targetPrice) > 0) && "targetPrice", !draft.deadline && "deadline"].filter(Boolean) as string[];
    if (gaps.length) {
      setMissing(gaps);
      return toast.error("Fill in the highlighted fields");
    }
    setBusy(true);
    try {
      const res = await sendJSON<{ ids: string[] }>("/api/demands", {
        demands: [
          {
            crop: draft.crop,
            qtyKg: Number(draft.qtyKg),
            grade: draft.grade,
            targetPrice: Number(draft.targetPrice),
            deadline: new Date(draft.deadline).toISOString(),
            urgent: draft.urgent,
            recurring: draft.recurring,
            frequency: draft.recurring ? draft.frequency : null,
            notes: draft.notes || undefined,
            source: voiceInfo ? "VOICE" : "FORM",
          },
        ],
      });
      toast.success("Posted, nearby farmers are being notified");
      router.push(`/bulk/demands/${res.ids[0]}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="pb-24 lg:pb-8">
      <PageHeader title="Post a *requirement*" back={{ href: "/bulk", label: "Requirements" }} />
      <LayoutGroup id="post-mode">
        <div className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border p-1">
          {[
            { k: "form" as const, icon: Keyboard, l: "Form" },
            { k: "voice" as const, icon: Mic, l: "Voice" },
            { k: "list" as const, icon: ListChecks, l: "List" },
          ].map((m) => (
            <button key={m.k} type="button" onClick={() => setMode(m.k)} className={cn("relative flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium", mode === m.k ? "text-background" : "text-muted-foreground")}>
              {mode === m.k && <motion.span layoutId="post-pill" className="absolute inset-0 -z-10 rounded-xl bg-foreground" />}
              <m.icon className="size-4" /> {m.l}
            </button>
          ))}
        </div>
      </LayoutGroup>

      {mode === "voice" && (
        <VoiceDemand
          onParsed={(r, transcript) => {
            const p: Partial<Draft> = { urgent: r.urgent, recurring: r.recurring, grade: r.grade };
            if (r.crop && isCropSlug(r.crop)) p.crop = r.crop;
            if (r.qtyKg) p.qtyKg = String(r.qtyKg);
            if (r.targetPrice) p.targetPrice = String(r.targetPrice);
            if (r.deadline) p.deadline = toLocalInput(r.deadline);
            if (r.frequency) p.frequency = r.frequency;
            setDraft((d) => ({ ...d, ...p }));
            setMissing(r.missing);
            setVoiceInfo({ transcript, source: r.source });
            setMode("form");
            toast.success("Here's what we heard, check it before posting");
          }}
        />
      )}
      {mode === "list" && <ListDemand />}

      {mode === "form" && (
        <div className="space-y-7">
          {voiceInfo && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/60 p-3 text-sm">
              <span className="italic">“{voiceInfo.transcript}”</span>
              <AISourceBadge source={voiceInfo.source} />
            </div>
          )}
          <section className={cn("space-y-3 rounded-3xl", missing.includes("crop") && "ring-2 ring-tomato/60 ring-offset-4 ring-offset-background")}>
            <Label className="text-[15px]">What do you need?</Label>
            <CropPicker value={draft.crop} onChange={(crop) => set({ crop })} />
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dq" className="text-[15px]">Quantity (kg)</Label>
              <QtyStepper id="dq" size="lg" value={draft.qtyKg} onChange={(qtyKg) => set({ qtyKg })} step={5} min={1} suffix="kg" className={cn(missing.includes("qtyKg") && "rounded-xl ring-2 ring-tomato/60")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dp" className="text-[15px]">Target price (₹/kg)</Label>
              <QtyStepper id="dp" size="lg" value={draft.targetPrice} onChange={(targetPrice) => set({ targetPrice })} step={1} min={1} suffix="/kg" className={cn(missing.includes("targetPrice") && "rounded-xl ring-2 ring-tomato/60")} />
              {market && (
                <p className="text-xs text-muted-foreground">
                  Indicative: {market.mandi} modal ₹{market.modalToday} · retail ~₹{market.suggested}.{" "}
                  <button type="button" className="font-semibold underline" onClick={() => set({ targetPrice: String(Math.round(market.modalToday * 1.05)) })}>
                    Use ₹{Math.round(market.modalToday * 1.05)}
                  </button>
                </p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <Label className="text-[15px]">Grade</Label>
            <div className="grid grid-cols-4 gap-2">
              {(["ANY", "A", "B", "C"] as Grade[]).map((g) => (
                <button key={g} type="button" onClick={() => set({ grade: g })} className={cn("h-11 rounded-xl border text-sm font-semibold", draft.grade === g && "border-foreground bg-foreground text-background")}>
                  {g === "ANY" ? "Any" : `Grade ${g}`}
                </button>
              ))}
            </div>
          </section>

          <section className={cn("space-y-2 rounded-2xl", missing.includes("deadline") && "ring-2 ring-tomato/60")}>
            <Label className="text-[15px]">Needed by</Label>
            <div className="flex flex-wrap gap-2">
              {DEADLINES.map((d) => {
                const v = d.value();
                return (
                  <button key={d.label} type="button" onClick={() => set({ deadline: v })} className={cn("min-h-11 rounded-full border px-4 text-sm", draft.deadline === v && "border-foreground bg-foreground text-background")}>
                    {d.label}
                  </button>
                );
              })}
            </div>
            <Input type="datetime-local" value={draft.deadline} min={at(0, new Date().getHours() + 1)} onChange={(e) => set({ deadline: e.target.value })} aria-label="Exact deadline" />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className={cn("flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-4 transition-colors", draft.urgent && "border-tomato bg-tomato/8")}>
              <span className="flex items-center gap-2">
                <Flame className={cn("size-5", draft.urgent && "text-tomato")} />
                <span>
                  <span className="block text-sm font-medium">Urgent</span>
                  <span className="block text-xs text-muted-foreground">Pushed to the top for farmers</span>
                </span>
              </span>
              <Switch checked={draft.urgent} onCheckedChange={(urgent) => set({ urgent })} />
            </label>
            <div className={cn("rounded-2xl border px-4 py-3", draft.recurring && "border-foreground")}>
              <label className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Repeat className="size-5" />
                  <span>
                    <span className="block text-sm font-medium">Recurring</span>
                    <span className="block text-xs text-muted-foreground">Repost on a schedule</span>
                  </span>
                </span>
                <Switch checked={draft.recurring} onCheckedChange={(recurring) => set({ recurring })} />
              </label>
              <AnimatePresence>
                {draft.recurring && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {(["DAILY", "WEEKLY"] as const).map((f) => (
                        <button key={f} type="button" onClick={() => set({ frequency: f })} className={cn("h-10 rounded-xl border text-sm", draft.frequency === f && "border-foreground bg-foreground text-background")}>
                          {f === "DAILY" ? "Daily" : "Weekly"}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="dn" className="text-[15px]">Notes for farmers</Label>
            <Textarea id="dn" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Size, delivery window, packing…" maxLength={300} />
          </section>

          <div className="glass sticky bottom-0 z-30 -mx-4 border-y px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 lg:bottom-4 lg:mx-0 lg:rounded-2xl lg:border lg:pb-3">
            <Button size="lg" variant="brand" className="w-full" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Post requirement
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ParsedDemandResult {
  crop: string | null;
  qtyKg: number | null;
  targetPrice: number | null;
  deadline: string | null;
  urgent: boolean;
  recurring: boolean;
  frequency: "DAILY" | "WEEKLY" | null;
  grade: Grade;
  missing: string[];
  source: string;
}

function VoiceDemand({ onParsed }: { onParsed: (r: ParsedDemandResult, transcript: string) => void }) {
  const [lang, setLang] = useState("hi-IN");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function parse(t: string) {
    setBusy(true);
    try {
      onParsed(await sendJSON<ParsedDemandResult>("/api/ai/parse-demand", { transcript: t, lang }), t);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const speech = useSpeech(parse);
  return (
    <div className="dark relative overflow-hidden rounded-[2rem] bg-background p-5 text-foreground">
      <span className="absolute -top-16 -right-12 size-56 animate-orb rounded-full bg-lime/20 blur-3xl" />
      <p className="relative text-lg font-semibold">Say what you need</p>
      <p className="relative text-sm text-muted-foreground">“50 kilo pyaz kal subah tak chahiye, urgent, 30 rupaye tak”</p>
      <div className="relative mt-3 flex flex-wrap gap-2">
        {SPEECH_LANGS.map((l) => (
          <button key={l.code} type="button" onClick={() => setLang(l.code)} className={cn("h-9 rounded-full border px-3 text-sm", lang === l.code ? "border-lime bg-lime text-lime-foreground" : "border-white/15 text-muted-foreground")}>
            {l.label}
          </button>
        ))}
      </div>
      <div className="relative flex flex-col items-center">
        <MicOrb listening={speech.listening} onClick={() => (speech.listening ? speech.stop() : speech.start(lang))} disabled={!speech.supported || busy} label="Speak your requirement" />
        <p className="-mt-3 min-h-12 max-w-md text-center">{speech.listening ? speech.interim || "Listening…" : busy ? "Understanding…" : !speech.supported ? "Voice isn't supported here, type below." : speech.error ?? "Tap and speak."}</p>
      </div>
      <div className="relative space-y-2">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="…or type it here" className="border-white/15" />
        <Button variant="brand" onClick={() => parse(text)} disabled={busy || text.trim().length < 3}>
          <Wand2 /> Fill the form
        </Button>
      </div>
    </div>
  );
}

interface ListRow {
  crop: CropSlug | null;
  name: string;
  qtyKg: string;
  targetPrice: string;
}

/** Indicative bulk target for a crop: today's mandi modal + 5% (same basis as the form's hint). */
async function marketTarget(crop: CropSlug): Promise<string> {
  try {
    const m = await sendJSON<{ modalToday: number }>("/api/ai/price-advice", { crop });
    return m.modalToday ? String(Math.round(m.modalToday * 1.05)) : "";
  } catch {
    return "";
  }
}

function ListDemand() {
  const router = useRouter();
  const [rows, setRows] = useState<ListRow[]>([]);
  const [text, setText] = useState("");
  const [deadline, setDeadline] = useState(at(1, 9));
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function accept(items: { name: string; qty: number; unit: string }[]) {
    const parsed = items.map((i) => ({ crop: matchCrop(i.name), name: i.name, qtyKg: String(i.unit === "g" ? i.qty / 1000 : i.qty), targetPrice: "" }));
    // Each row gets its own crop's indicative target; the buyer can edit any of them.
    const crops = [...new Set(parsed.map((r) => r.crop).filter((c): c is CropSlug => Boolean(c)))];
    const targets = Object.fromEntries(await Promise.all(crops.map(async (c) => [c, await marketTarget(c)] as const)));
    setRows(parsed.map((r) => ({ ...r, targetPrice: r.crop ? (targets[r.crop] ?? "") : "" })));
  }
  async function readText() {
    setBusy(true);
    try {
      await accept((await sendJSON<{ items: { name: string; qty: number; unit: string }[] }>("/api/ai/parse-grocery-list", { text })).items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function readPhoto(f: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", f);
      const r = await sendForm<{ items: { name: string; qty: number; unit: string }[]; sample: boolean }>("/api/ai/parse-grocery-list", form);
      if (r.sample) toast("Photo reading needs the AI service, showing a sample list to edit");
      await accept(r.items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function postAll() {
    // Never drop a row silently: name every incomplete one and post nothing.
    const incomplete = rows.filter((r) => !(r.crop && Number(r.qtyKg) > 0 && Number(r.targetPrice) > 0));
    if (incomplete.length) {
      return toast.error(`Add a known crop, quantity and target price for: ${incomplete.map((r) => (r.crop ? cropName(r.crop) : r.name || "an empty row")).join(", ")}`);
    }
    const valid = rows;
    if (!valid.length) return toast.error("Add at least one item");
    setBusy(true);
    try {
      await sendJSON("/api/demands", {
        demands: valid.map((r) => ({ crop: r.crop, qtyKg: Number(r.qtyKg), grade: "ANY", targetPrice: Number(r.targetPrice), deadline: new Date(deadline).toISOString(), urgent, recurring: false, source: "LIST" })),
      });
      toast.success(valid.length === 1 ? "Requirement posted" : `${valid.length} requirements posted`);
      router.push("/bulk");
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-dashed bg-card p-5">
        <p className="font-semibold">Upload or paste your procurement list</p>
        <Textarea className="mt-3" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"onion 60 kg\ntomato 40 kg\npotato 100 kg"} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="brand" onClick={readText} disabled={busy || text.trim().length < 3}>
            <Wand2 /> Read text
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ListChecks />} Photo
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && readPhoto(e.target.files[0])} />
      </div>
      {rows.length > 0 && (
        <div className="space-y-3 rounded-3xl border bg-card p-4">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-b pb-3 last:border-0 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
              <select
                aria-label="Crop"
                value={r.crop ?? ""}
                onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, crop: (e.target.value || null) as CropSlug | null } : x)))}
                className={cn("col-span-3 h-11 rounded-xl border bg-background/60 px-3 text-base sm:col-span-1", !r.crop && "border-tomato")}
              >
                <option value="">{r.name}, pick crop</option>
                {CROP_SLUGS.map((c) => (
                  <option key={c} value={c}>
                    {cropName(c)}
                  </option>
                ))}
              </select>
              <Input aria-label="Kg" inputMode="decimal" value={r.qtyKg} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, qtyKg: e.target.value } : x)))} placeholder="kg" />
              <Input aria-label="Target ₹/kg" inputMode="decimal" value={r.targetPrice} onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, targetPrice: e.target.value } : x)))} placeholder="₹/kg" />
              <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setRows((xs) => [...xs, { crop: null, name: "item", qtyKg: "", targetPrice: "" }])}>
            <Plus /> Add row
          </Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Deadline for all" />
            <label className="flex min-h-11 items-center justify-between rounded-xl border px-3 text-sm">
              Urgent <Switch checked={urgent} onCheckedChange={setUrgent} />
            </label>
          </div>
          <Button size="lg" variant="brand" className="w-full" onClick={postAll} disabled={busy}>
            <Send /> Post {rows.length} requirement{rows.length > 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
