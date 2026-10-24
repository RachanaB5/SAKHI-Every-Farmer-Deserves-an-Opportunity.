// Voice listing block (wizard step 1): pick a language, speak, and the
// transcript is structured by /api/ai/parse-listing. Extracted values only
// pre-fill the form — the farmer reviews and edits before continuing.
"use client";

import { Keyboard, Loader2, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { AISourceBadge } from "@/components/ai/ai-labels";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MicOrb } from "@/components/voice/mic-orb";
import { SPEECH_LANGS, useSpeech } from "@/hooks/use-speech";
import { cropName } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";
import { formatDate, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ParsedListingResult {
  crop: string | null;
  qty: number | null;
  unit: "kg" | "litre" | "dozen" | null;
  harvestDate: string | null;
  price: number | null;
  missing: string[];
  source: "ai" | "fallback";
}

const LANG_FOR_UI: Record<string, string> = { hi: "hi-IN", kn: "kn-IN", en: "en-IN" };

/**
 * @param onParsed - receives structured fields + the transcript and language used
 */
export function VoiceCapture({
  onParsed,
}: {
  onParsed: (result: ParsedListingResult, transcript: string, lang: string) => void;
}) {
  const { t, lang: uiLang } = useI18n();
  const [lang, setLang] = useState(LANG_FOR_UI[uiLang] ?? "hi-IN");
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [heard, setHeard] = useState<{ transcript: string; result: ParsedListingResult } | null>(null);

  async function parse(transcript: string) {
    setParsing(true);
    try {
      const result = await sendJSON<ParsedListingResult>("/api/ai/parse-listing", { transcript, lang });
      setHeard({ transcript, result });
      onParsed(result, transcript, lang);
      toast.success(t("batch.extracted"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  const speech = useSpeech((said) => parse(said));
  const toggle = () => (speech.listening ? speech.stop() : speech.start(lang));

  return (
    <section className="dark relative overflow-hidden rounded-[2rem] bg-background p-5 text-foreground sm:p-7">
      <div className="absolute -top-20 -right-16 size-64 animate-orb rounded-full bg-lime/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-10 size-56 animate-orb rounded-full bg-tomato/15 blur-3xl [animation-delay:-5s]" />
      <div className="relative">
        <p className="text-xl font-semibold">{t("batch.speak")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("batch.speakHint")}</p>

        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t("batch.speechLang")}>
          {SPEECH_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={lang === l.code}
              onClick={() => setLang(l.code)}
              className={cn(
                "h-9 rounded-full border px-3.5 text-sm transition-colors",
                lang === l.code ? "border-lime bg-lime text-lime-foreground" : "border-white/15 text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-col items-center">
          <MicOrb
            listening={speech.listening}
            onClick={toggle}
            disabled={parsing || !speech.supported}
            label={speech.listening ? t("batch.stopRecording") : t("batch.speak")}
          />
          <AnimatePresence mode="wait">
            {speech.listening ? (
              <motion.p key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="-mt-3 min-h-12 max-w-md text-center text-lg">
                {speech.interim || <span className="text-muted-foreground">{t("batch.listening")}</span>}
              </motion.p>
            ) : parsing ? (
              <motion.p key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="-mt-3 inline-flex min-h-12 items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {t("batch.understanding")}
              </motion.p>
            ) : (
              <motion.p key="h" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="-mt-3 min-h-12 max-w-md text-center text-sm text-muted-foreground">
                {!speech.supported ? t("speech.unsupported") : (speech.error ?? t("batch.tapMic"))}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {heard && !speech.listening && !parsing && <Heard key="heard" transcript={heard.transcript} result={heard.result} />}
        </AnimatePresence>

        <div className="mt-4">
          {!typing ? (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setTyping(true)}>
              <Keyboard /> {t("batch.orType")}
            </Button>
          ) : (
            <div className="space-y-2">
              <Textarea
                autoFocus
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("batch.typePh")}
                className="border-white/15"
              />
              <Button type="button" variant="brand" disabled={parsing || text.trim().length < 2} onClick={() => parse(text)}>
                <Wand2 /> {t("batch.fillForm")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** "Here's what we heard" summary: extracted values + what's still missing. */
function Heard({ transcript, result }: { transcript: string; result: ParsedListingResult }) {
  const { t, lang } = useI18n();
  const chips = [
    result.crop && { k: t("batch.crop"), v: cropName(result.crop, lang) },
    result.qty && { k: t("batch.quantity"), v: result.unit ? formatQty(result.qty, result.unit, lang) : String(result.qty) },
    result.harvestDate && { k: t("batch.harvestDate"), v: formatDate(`${result.harvestDate}T12:00:00`, lang) },
    result.price && { k: t("batch.price"), v: `₹${result.price}` },
  ].filter(Boolean) as { k: string; v: string }[];
  const labels: Record<string, string> = { crop: t("batch.crop"), qty: t("batch.quantity"), unit: t("batch.unit"), harvestDate: t("batch.harvestDate"), price: t("batch.price") };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm italic opacity-90">“{transcript}”</p>
        <AISourceBadge source={result.source} className="border-white/15" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c, i) => (
          <motion.span
            key={c.k}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-full bg-lime px-3 py-1 text-sm font-medium text-lime-foreground"
          >
            <span className="opacity-60">{c.k}:</span> {c.v}
          </motion.span>
        ))}
        {result.missing
          .filter((m) => m !== "unit" || !result.qty)
          .map((m) => (
            <span key={m} className="rounded-full border border-dashed border-tomato px-3 py-1 text-sm text-tomato">
              {labels[m] ?? m}?
            </span>
          ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("batch.extracted")}</p>
    </motion.div>
  );
}
