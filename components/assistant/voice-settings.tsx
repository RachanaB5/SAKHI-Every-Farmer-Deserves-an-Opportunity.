// Voice and speed for Sakhi on this device: a female (default) or male
// voice, the voices the browser has for the current language (most natural
// first), three speeds and a sample to hear the choice. Voices are per
// device, so the choice is remembered on this device only.
"use client";

import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AssistantLang } from "@/lib/assistant/intents";
import { getGender, getSpeed, setGender, setSpeed, setVoiceChoice, speak, voiceOptions, type Gender, type Speed, type VoiceOption } from "@/lib/assistant/tts";
import { translate, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SPEEDS: Speed[] = ["slow", "normal", "fast"];
const GENDERS: Gender[] = ["female", "male"];

/**
 * @param lang - language whose voices are listed
 * @param onSpeaking - avatar hook while the sample plays
 */
export function VoiceSettings({ lang, onSpeaking }: { lang: AssistantLang; onSpeaking?: (on: boolean) => void }) {
  const t = (k: MessageKey) => translate(lang, k);
  const [state, setState] = useState<{ options: VoiceOption[]; current: string | null; borrowed: boolean } | null>(null);
  const [speed, setSpeedState] = useState<Speed>(() => getSpeed());
  const [gender, setGenderState] = useState<Gender>(() => getGender());

  const reload = () => voiceOptions(lang).then(setState);
  useEffect(() => {
    let live = true;
    voiceOptions(lang).then((r) => live && setState(r));
    return () => {
      live = false;
    };
  }, [lang]);

  async function sample() {
    onSpeaking?.(true);
    await speak(t("ff.voice.sample"), lang);
    onSpeaking?.(false);
  }

  if (state === null) return null;
  const { options, current, borrowed } = state;
  if (!options.length) return <p className="text-xs text-muted-foreground">{t("ff.voice.none")}</p>;
  const genders = new Set(options.map((o) => o.gender));
  const anyNatural = options.some((o) => o.natural);
  return (
    <div className="space-y-2">
      {genders.has("female") && genders.has("male") && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t("ff.voice.gender")}>
          {GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={gender === g}
              onClick={() => {
                setGender(g);
                setGenderState(g);
                void reload().then(sample);
              }}
              className={cn("min-h-11 rounded-lg text-xs font-medium", gender === g ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {t(`ff.voice.${g}`)}
            </button>
          ))}
        </div>
      )}
      <label className="block text-sm font-medium" htmlFor={`ff-voice-${lang}`}>
        {t("ff.voice.title")}
      </label>
      <select
        id={`ff-voice-${lang}`}
        value={current ?? ""}
        onChange={(e) => {
          setVoiceChoice(lang, e.target.value);
          setState({ ...state, current: e.target.value });
          void sample();
        }}
        className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.uri} value={o.uri}>
            {o.label}
            {o.natural && !/natural/i.test(o.label) ? ` · ${t("ff.voice.natural")}` : ""}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t("ff.voice.speed")}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            onClick={() => {
              setSpeed(s);
              setSpeedState(s);
              void sample();
            }}
            className={cn("min-h-11 rounded-lg text-xs font-medium", speed === s ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {t(`ff.voice.${s}`)}
          </button>
        ))}
      </div>
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={sample}>
        <Volume2 /> {t("ff.voice.preview")}
      </Button>
      {borrowed && <p className="text-xs text-muted-foreground">{t("ff.voice.borrowed")}</p>}
      {!borrowed && !anyNatural && <p className="text-xs text-muted-foreground">{t("ff.voice.tip")}</p>}
    </div>
  );
}

/**
 * One row to pick a female or male voice and hear it, shown before a
 * conversation starts. Hidden when the device doesn't offer both.
 */
export function VoiceQuickPick({ lang }: { lang: AssistantLang }) {
  const t = (k: MessageKey) => translate(lang, k);
  const [both, setBoth] = useState(false);
  const [gender, setGenderState] = useState<Gender>(() => getGender());
  useEffect(() => {
    let live = true;
    voiceOptions(lang).then((r) => {
      const g = new Set(r.options.map((o) => o.gender));
      if (live) setBoth(g.has("female") && g.has("male"));
    });
    return () => {
      live = false;
    };
  }, [lang]);
  if (!both) return null;
  return (
    <div className="mt-3 flex items-center gap-2" role="radiogroup" aria-label={t("ff.voice.gender")}>
      <span className="text-xs text-muted-foreground">{t("ff.voice.title")}</span>
      {(["female", "male"] as const).map((g) => (
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={gender === g}
          onClick={() => {
            setGender(g);
            setGenderState(g);
            void speak(t("ff.voice.sample"), lang);
          }}
          className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium", gender === g ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted")}
        >
          <Volume2 className="size-4" /> {t(`ff.voice.${g}`)}
        </button>
      ))}
    </div>
  );
}
