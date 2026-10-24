// Sakhi on the seller sign-up: talks the farmer through all six
// screens in Kannada, Hindi or English, asks every question out loud, fills
// the form from the answer (spoken or typed), moves on by itself and, once
// the PIN is typed, creates the account on a spoken "yes". Everything runs
// in the browser: answers only go into the form on screen, which the
// farmer can still change, until the account is created.
"use client";

import { Mic, MicOff, Repeat, Send, Settings2, SkipForward, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { AssistantLang } from "@/lib/assistant/intents";
import { SPEECH_CODE } from "@/lib/assistant/language";
import { cleanAnswer, findCrops, guideCommand, matchVillage, mobileFrom, sellCategory, spokenDigits } from "@/lib/assistant/signup";
import { choiceLabel, fill as fillLine, LINES, matchMany, matchOne, matchYesNo, sameAsName, SCRIPT, type L3, type Question, type SellerAnswers } from "@/lib/assistant/signup-script";
import { createStt, type SttError, type SttLang, type SttProvider } from "@/lib/assistant/stt";
import { speak, stopSpeaking, ttsSupported, voiceMode, type VoiceMode } from "@/lib/assistant/tts";
import { cropName, type CropSlug } from "@/lib/crops";
import { translate, type MessageKey } from "@/lib/i18n";
import { joinText } from "@/lib/i18n/seller-join";
import { cn } from "@/lib/utils";
import { FarmerFriendAvatar, type AvatarState } from "./avatar";
import { STT_CONFIDENT } from "./use-farmer-friend";
import { VoiceQuickPick, VoiceSettings } from "./voice-settings";

export type GuideValues = SellerAnswers;
export type GuidePatch = Partial<SellerAnswers>;

/** What the guide is waiting for: a scripted question, or one of the closing steps. */
type Pending = { kind: "q"; q: Question } | { kind: "pinCheck"; pin: string } | { kind: "pinType" } | { kind: "create" } | null;

const LANGS: { value: AssistantLang; label: string }[] = [
  { value: "kn", label: "ಕನ್ನಡ" },
  { value: "hi", label: "हिंदी" },
  { value: "en", label: "English" },
];
const HANDS_FREE_KEY = "ff-join-handsfree";
const MIC_KEY = "ff-mic-explained";
const LOCALE: Record<AssistantLang, string> = { en: "en-IN", hi: "hi-IN", kn: "kn-IN" };
const LAST_STEP = 5;

const answered = (v: GuideValues, q: Question) => {
  const value = v[q.field];
  return Array.isArray(value) ? value.length > 0 : typeof value === "boolean" ? value : !!value.trim();
};
const spaced = (digits: string) => (digits.length === 10 ? `${digits.slice(0, 5).split("").join(" ")}, ${digits.slice(5).split("").join(" ")}` : digits.split("").join(" "));
const toLang = (l: string): AssistantLang => (l === "en" || l === "hi" ? l : "kn");
function listOf(items: string[], lang: AssistantLang) {
  try {
    return new Intl.ListFormat(LOCALE[lang], { type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}
const local = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* not remembered */
    }
  },
};

export interface GuideOptions {
  /** Current wizard screen (0–5). */
  step: number;
  /** The wizard's "Preferred language" value. */
  lang: string;
  onLang: (lang: AssistantLang) => void;
  values: GuideValues;
  /** Joining with Google: no PIN on the last screen. */
  google: boolean;
  /** The PIN box holds a valid PIN (typed by the farmer, never spoken). */
  pinReady: boolean;
  /** The wizard's current error, e.g. why the account couldn't be created. */
  error: string | null;
  onFill: (patch: GuidePatch) => void;
  /**
   * Moves on like the Next button (creates the account on the last screen); false when the screen isn't complete.
   * @param values - the guide's answers, which can be newer than the wizard's last render
   */
  onNext: (values: GuideValues) => boolean;
  onBack: () => void;
}

/** State and actions of the sign-up guide. */
export function useSignupGuide(opts: GuideOptions) {
  const lang = toLang(opts.lang);
  const [active, setActive] = useState(false);
  const [avatar, setAvatar] = useState<AvatarState>("idle");
  const [word, setWord] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [heardLow, setHeardLow] = useState(false);
  const [listening, setListening] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const [mode, setMode] = useState<VoiceMode | null>(null);
  const [handsFree, setHandsFreeState] = useState(() => local.get(HANDS_FREE_KEY) !== "0");

  // Latest props and settings for callbacks that outlive a render.
  const latest = useRef({ ...opts, lang, handsFree });
  useEffect(() => {
    latest.current = { ...opts, lang, handsFree };
  });
  const values = useRef(opts.values);
  useEffect(() => {
    values.current = opts.values;
  }, [opts.values]);

  const activeRef = useRef(false);
  const pending = useRef<Pending>(null);
  const skipped = useRef(new Set<string>());
  const pinSuggestion = useRef<string | null>(null);
  const carry = useRef("");
  const creating = useRef(false);
  const pickedTurn = useRef(0);
  const lastLine = useRef<{ text: string; listen: boolean }>({ text: "", listen: false });
  const flow = useRef(0);
  const stt = useRef<SttProvider | null>(null);

  const line = useCallback((l: L3, vars?: Record<string, string | number>) => fillLine(l[latest.current.lang], vars), []);
  const tr = useCallback((key: MessageKey) => translate(latest.current.lang, key), []);

  useEffect(() => {
    let live = true;
    voiceMode(lang).then((m) => live && setMode(m));
    return () => {
      live = false;
    };
  }, [lang]);

  const stopMic = useCallback(() => {
    stt.current?.abort();
    setListening(false);
  }, []);

  const sttError = useCallback(
    (e: SttError) => {
      if (e === "not-allowed") {
        setHandsFreeState(false);
        setNotice(tr("ff.micDenied"));
      } else if (e === "language-not-supported") setNotice(tr("ff.sttLanguage"));
      else setNotice(e === "no-speech" ? tr("ff.noSpeech") : e === "unsupported" || e === "not-implemented" ? tr("ff.sttUnsupported") : line(LINES.unclear));
      setAvatar(e === "no-speech" ? "idle" : "error");
    },
    [line, tr],
  );

  // `answer` and `listen` call each other through a ref.
  const answerRef = useRef<(text: string) => void>(() => {});

  const listen = useCallback(() => {
    if (!stt.current) stt.current = createStt();
    if (!stt.current.isAvailable()) return sttError("unsupported");
    stopSpeaking();
    setNotice(null);
    setHeardLow(false);
    setListening(true);
    setAvatar("listening");
    stt.current.start(SPEECH_CODE[latest.current.lang] as SttLang, {
      onInterim: (text) => setInput(text),
      onFinal: (text, confidence) => {
        // Low-confidence speech waits for "Use this"; commands and confident answers go straight in.
        if (confidence > 0 && confidence < STT_CONFIDENT && !guideCommand(text)) {
          setInput(text);
          setHeardLow(true);
          setNotice(tr("ff.lowConfidence"));
          return;
        }
        answerRef.current(text);
      },
      onError: sttError,
      onEnd: () => {
        setListening(false);
        setAvatar((a) => (a === "listening" ? "idle" : a));
      },
    });
  }, [sttError, tr]);

  /** Shows and speaks one line, then opens the mic if a spoken answer is expected. */
  const sayLine = useCallback(
    async (text: string, listenAfter: boolean) => {
      const mine = ++flow.current;
      stopMic();
      setPrompt(text);
      setNotice(null);
      setNeedTap(false);
      lastLine.current = { text, listen: listenAfter };
      const result = ttsSupported() ? await speak(text, latest.current.lang, { onStart: () => setAvatar("speaking"), onBoundary: () => setWord((w) => w + 1) }) : "unsupported";
      if (mine !== flow.current || !activeRef.current) return;
      setAvatar("idle");
      if (result === "blocked") return setNeedTap(true);
      if (listenAfter && latest.current.handsFree) listen();
    },
    [listen, stopMic],
  );

  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

  /** Moves to the next screen; what was just said is carried into that screen's introduction. */
  const advance = useCallback(
    (said: string) => {
      carry.current = said;
      if (!latest.current.onNext(values.current)) {
        carry.current = "";
        void sayLine(join(said, line(LINES.notYet)), false);
      }
    },
    [line, sayLine],
  );

  /** Asks the next open question on this screen, or moves on when there's none. */
  const ask = useCallback(
    (said = "") => {
      const step = latest.current.step;
      const v = values.current;
      const q = (SCRIPT[step] ?? []).find((x) => !skipped.current.has(x.field) && !answered(v, x));
      if (q) {
        if (q.kind === "pincode" && pinSuggestion.current) {
          pending.current = { kind: "pinCheck", pin: pinSuggestion.current };
          return void sayLine(join(said, line(LINES.pinCheck, { pin: spaced(pinSuggestion.current) })), true);
        }
        pending.current = { kind: "q", q };
        return void sayLine(join(said, q.ask[latest.current.lang]), true);
      }
      if (step < LAST_STEP) {
        pending.current = null;
        return advance(said);
      }
      if (!latest.current.google && !latest.current.pinReady) {
        pending.current = { kind: "pinType" };
        return void sayLine(join(said, line(LINES.pin)), false);
      }
      pending.current = { kind: "create" };
      void sayLine(join(said, line(LINES.create, { name: v.contactName.split(" ")[0] })), true);
    },
    [advance, line, sayLine],
  );

  /** What the guide says on arriving at a screen. */
  const enterStep = useCallback(
    (step: number) => {
      pending.current = null;
      const said = carry.current;
      carry.current = "";
      ask(join(said, step === 0 ? line(LINES.intro) : line(LINES.step[step])));
    },
    [ask, line],
  );

  const fill = useCallback((patch: GuidePatch) => {
    values.current = { ...values.current, ...patch };
    latest.current.onFill(patch);
  }, []);

  const answer = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const lang = latest.current.lang;
      const p = pending.current;
      setInput("");
      setHeardLow(false);
      switch (guideCommand(text)) {
        case "repeat":
          return void sayLine(lastLine.current.text, lastLine.current.listen);
        case "skip":
          if (p?.kind === "q") skipped.current.add(p.q.field);
          if (p?.kind === "pinCheck") pinSuggestion.current = null;
          return ask();
        case "back":
          if (latest.current.step > 0) latest.current.onBack();
          else ask();
          return;
        case "next":
          if (latest.current.step < LAST_STEP) return advance("");
          if (p?.kind !== "create") return ask();
      }
      if (!p) return void sayLine(line(LINES.unclear), false);
      setAvatar("thinking");
      const got = (value: string) => line(LINES.got, { value });
      const noted = (value: string) => line(LINES.picked[pickedTurn.current++ % LINES.picked.length], { value });

      if (p.kind === "pinType") return void sayLine(line(LINES.pin), false);
      if (p.kind === "pinCheck") {
        const yes = matchYesNo(text);
        pinSuggestion.current = null;
        if (yes === "yes") {
          fill({ pincode: p.pin });
          return ask(line(LINES.ok));
        }
        const digits = spokenDigits(text);
        if (/^\d{6}$/.test(digits)) {
          fill({ pincode: digits });
          return ask(got(spaced(digits)));
        }
        return ask();
      }
      if (p.kind === "create") {
        const yes = matchYesNo(text) ?? (guideCommand(text) === "next" ? "yes" : null);
        if (yes !== "yes") return void sayLine(line(LINES.notNow), false);
        creating.current = true;
        void sayLine(line(LINES.creating), false);
        if (!latest.current.onNext(values.current)) {
          creating.current = false;
          void sayLine(line(LINES.notYet), false);
        }
        return;
      }

      const q = p.q;
      switch (q.kind) {
        case "phone": {
          const digits = spokenDigits(text);
          const mobile = mobileFrom(digits);
          if (!mobile) return void sayLine(line(LINES.badPhone, { n: digits.length }), true);
          fill({ phone: `${mobile.slice(0, 5)} ${mobile.slice(5)}` });
          return ask(got(spaced(mobile)));
        }
        case "pincode": {
          const digits = spokenDigits(text);
          if (!/^\d{6}$/.test(digits)) return void sayLine(line(LINES.badPin, { n: digits.length }), true);
          fill({ pincode: digits });
          return ask(got(spaced(digits)));
        }
        case "village": {
          const known = matchVillage(text);
          if (known) {
            fill({ village: known.village, area: known.area, ...(known.district && { district: known.district }) });
            pinSuggestion.current = values.current.pincode ? null : (known.pin ?? null);
            const place = { village: known.village, area: choiceLabel("area", known.area, lang), district: known.district ?? "" };
            return ask(line(known.district ? LINES.village : LINES.villageArea, place));
          }
          const value = cleanAnswer(text, "place");
          if (!value) return void sayLine(line(LINES.unclear), true);
          fill({ village: value });
          return ask(got(value));
        }
        case "crops": {
          const found = findCrops(text);
          if (!found.length) return void sayLine(line(LINES.noCrop), true);
          const v = values.current;
          fill({ crops: [...new Set([...v.crops, ...found])], categories: [...new Set([...v.categories, ...found.map(sellCategory)])] });
          const names = found.map((c: CropSlug) => (lang === "en" ? cropName(c, lang).toLowerCase() : cropName(c, lang)));
          return ask(line(LINES.crops, { crops: listOf(names, lang) }));
        }
        case "one": {
          const value = matchOne(q.field, text);
          if (!value) return void sayLine(line(LINES.unclear), true);
          fill({ [q.field]: value });
          return ask(noted(choiceLabel(q.field, value, lang)));
        }
        case "many": {
          const chosen = matchMany(q.field, text);
          if (!chosen.length) return void sayLine(line(LINES.unclear), true);
          fill({ [q.field]: chosen });
          return ask(noted(listOf(chosen.map((x) => choiceLabel(q.field, x, lang)), lang)));
        }
        case "yesno": {
          const yes = matchYesNo(text);
          if (!yes) return void sayLine(line(LINES.unclear), true);
          if (yes === "yes") {
            fill({ [q.field]: true });
            return ask(line(LINES.ok));
          }
          skipped.current.add(q.field);
          return ask(line(LINES.declined));
        }
        case "text": {
          if (q.field === "businessName" && sameAsName(text) && values.current.contactName) {
            fill({ businessName: values.current.contactName });
            return ask(line(LINES.farmSame, { value: values.current.contactName }));
          }
          const value = cleanAnswer(text, q.field === "contactName" ? "name" : q.field === "businessName" ? "farm" : q.field === "addressLine" ? "address" : "place");
          if (!value) return void sayLine(line(LINES.unclear), true);
          fill({ [q.field]: value });
          return ask(got(value));
        }
      }
    },
    [advance, ask, fill, line, sayLine],
  );
  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  // A new screen (by voice or by the Next / Back buttons) gets its own introduction.
  const shownStep = useRef(opts.step);
  useEffect(() => {
    if (shownStep.current === opts.step) return;
    shownStep.current = opts.step;
    if (activeRef.current) enterStep(opts.step);
  }, [opts.step, enterStep]);

  // Switching language mid-way repeats the current question in the new language.
  const shownLang = useRef(lang);
  useEffect(() => {
    if (shownLang.current === lang) return;
    shownLang.current = lang;
    if (activeRef.current) ask();
  }, [lang, ask]);

  // Once the PIN is typed, ask to create the account.
  useEffect(() => {
    if (opts.pinReady && activeRef.current && pending.current?.kind === "pinType") ask();
  }, [opts.pinReady, ask]);

  // The account couldn't be created (e.g. the number is already registered): say why.
  useEffect(() => {
    if (!opts.error || !creating.current || !activeRef.current) return;
    creating.current = false;
    pending.current = null;
    void sayLine(line(LINES.failed, { reason: joinText(opts.error, latest.current.lang) }), false);
  }, [opts.error, line, sayLine]);

  const close = useCallback(() => {
    flow.current++;
    activeRef.current = false;
    stopSpeaking();
    stt.current?.abort();
    setActive(false);
    setListening(false);
    setAvatar("idle");
  }, []);
  useEffect(() => () => close(), [close]);

  return {
    lang,
    active,
    avatar,
    word,
    prompt,
    notice,
    input,
    heardLow,
    listening,
    needTap,
    mode,
    handsFree,
    canListen: () => createStt().isAvailable(),
    setInput: (v: string) => {
      setInput(v);
      setHeardLow(false);
    },
    setLang: (l: AssistantLang) => latest.current.onLang(l),
    setHandsFree: (on: boolean) => {
      local.set(HANDS_FREE_KEY, on ? "1" : "0");
      setHandsFreeState(on);
    },
    /** Starting is the farmer's tap, so the browser lets the guide speak and may ask for the mic. */
    start: () => {
      local.set(MIC_KEY, "1");
      latest.current.onLang(latest.current.lang);
      activeRef.current = true;
      skipped.current.clear();
      setActive(true);
      enterStep(latest.current.step);
    },
    close,
    submit: () => answer(input),
    toggleMic: () => (listening ? stt.current?.stop() : listen()),
    repeat: () => void sayLine(lastLine.current.text, lastLine.current.listen),
    skip: () => answer("skip"),
    tapToHear: () => void sayLine(lastLine.current.text, lastLine.current.listen),
    setAvatar,
  };
}

export type SignupGuide = ReturnType<typeof useSignupGuide>;

/** The invitation at the top of the sign-up screens: pick a language, then start. */
export function GuideBanner({ guide, compact }: { guide: SignupGuide; compact?: boolean }) {
  if (guide.active) return null;
  const t = (k: MessageKey) => translate(guide.lang, k);
  return (
    <div className={cn("relative mb-6 overflow-hidden rounded-3xl border bg-lime/15", compact ? "p-3" : "p-4 sm:p-5")}>
      <div className="flex items-center gap-3">
        <FarmerFriendAvatar state="idle" size={compact ? 44 : 64} />
        <div className="min-w-0 flex-1">
          <p className="leading-snug font-semibold">{t("ff.join.banner.title")}</p>
          {!compact && <p className="mt-0.5 text-sm text-muted-foreground">{t("ff.join.banner.body")}</p>}
          {guide.lang !== "en" && <p className="mt-0.5 text-xs text-muted-foreground">{translate("en", "ff.join.banner.title")}</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t("ff.welcome.pickLang")}>
        {LANGS.map((l) => (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={guide.lang === l.value}
            onClick={() => guide.setLang(l.value)}
            className={cn("min-h-11 rounded-xl border text-sm font-medium transition-colors", guide.lang === l.value ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted")}
          >
            {l.label}
          </button>
        ))}
      </div>
      {!compact && <VoiceQuickPick lang={guide.lang} />}
      <Button type="button" size="lg" variant="brand" className="mt-3 min-h-12 w-full text-base" onClick={guide.start}>
        <Mic /> {t("ff.join.start")}
      </Button>
      {!compact && <p className="mt-2 text-xs text-muted-foreground">{t("ff.micExplain")}</p>}
    </div>
  );
}

/** The docked guide while it's running: what it's asking, the answer box, mic, repeat and skip. */
export function GuideBar({ guide }: { guide: SignupGuide }) {
  const t = (k: MessageKey) => translate(guide.lang, k);
  const [sttOk] = useState(() => guide.canListen());
  return (
    <>
      <AnimatePresence>
        {guide.active && (
          <motion.div
            role="dialog"
            aria-label={t("ff.join.title")}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            // Phones: docked at the bottom. Tablets: bottom-right card. Desktop: over the brand panel, clear of the form.
            className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-18px_40px_-24px_rgba(0,0,0,0.45)] backdrop-blur sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[400px] sm:rounded-3xl sm:border lg:top-24 lg:right-auto lg:bottom-auto lg:left-10 lg:w-[420px]"
          >
            <div className="flex items-start gap-3">
              <FarmerFriendAvatar state={guide.avatar} word={guide.word} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {t("ff.join.title")} · <span aria-live="polite">{t(`ff.state.${guide.avatar}` as MessageKey)}</span>
                  </p>
                  <div className="-mt-1 -mr-2 flex shrink-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-11" aria-label={t("ff.settings")}>
                          <Settings2 className="size-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="max-h-[70vh] w-72 space-y-3 overflow-y-auto">
                        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={t("ff.welcome.pickLang")}>
                          {LANGS.map((l) => (
                            <button
                              key={l.value}
                              type="button"
                              role="radio"
                              aria-checked={guide.lang === l.value}
                              onClick={() => guide.setLang(l.value)}
                              className={cn("min-h-11 rounded-xl text-sm font-medium", guide.lang === l.value ? "bg-foreground text-background" : "hover:bg-muted")}
                            >
                              {l.label}
                            </button>
                          ))}
                        </div>
                        {sttOk && (
                          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                            {t("ff.join.handsFree")}
                            <Switch checked={guide.handsFree} onCheckedChange={guide.setHandsFree} />
                          </label>
                        )}
                        {ttsSupported() && <VoiceSettings lang={guide.lang} onSpeaking={(on) => guide.setAvatar(on ? "speaking" : "idle")} />}
                        <p className="text-xs text-muted-foreground">
                          <b className="text-foreground">{t("ff.privacy")}.</b> {t("ff.micExplain")}
                        </p>
                      </PopoverContent>
                    </Popover>
                    <Button variant="ghost" size="icon" className="size-11" onClick={guide.close} aria-label={t("ff.join.close")}>
                      <X className="size-5" />
                    </Button>
                  </div>
                </div>
                <motion.p key={guide.prompt} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[15px] leading-snug">
                  {guide.prompt}
                </motion.p>
                {guide.mode === "none" && <p className="mt-1 text-xs text-muted-foreground">🔇 {t("ff.voiceUnavailable")}</p>}
                {guide.mode === "borrowed" && <p className="mt-1 text-xs text-muted-foreground">{t("ff.voice.borrowed")}</p>}
              </div>
            </div>

            {(guide.notice || !sttOk) && (
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                {guide.notice ?? t("ff.sttUnsupported")}
              </p>
            )}
            {guide.needTap && (
              <Button className="mt-2 min-h-12 w-full" onClick={guide.tapToHear}>
                🔊 {t("ff.tapToHear")}
              </Button>
            )}

            <form
              className={cn("mt-2 flex items-center gap-2 rounded-2xl border bg-background p-1.5", guide.heardLow && "border-lime ring-2 ring-lime/30", guide.listening && "border-red-400")}
              onSubmit={(e) => {
                e.preventDefault();
                guide.submit();
              }}
            >
              <input
                value={guide.input}
                onChange={(e) => guide.setInput(e.target.value)}
                placeholder={guide.listening ? t("ff.state.listening") : t("ff.join.placeholder")}
                aria-label={t("ff.join.placeholder")}
                className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
              />
              <Button type="submit" size={guide.heardLow ? "default" : "icon"} className={cn("min-h-11 shrink-0", !guide.heardLow && "size-11")} disabled={!guide.input.trim()} aria-label={guide.heardLow ? t("ff.useThis") : t("ff.send")}>
                <Send />
                {guide.heardLow && t("ff.useThis")}
              </Button>
            </form>

            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" className="min-h-12 min-w-24 justify-start" onClick={guide.repeat} aria-label={t("ff.repeat")}>
                <Repeat className="size-5" />
              </Button>
              <motion.button
                type="button"
                onClick={guide.toggleMic}
                disabled={!sttOk}
                whileTap={{ scale: 0.92 }}
                aria-label={guide.listening ? t("ff.micStop") : t("ff.mic")}
                aria-pressed={guide.listening}
                className={cn(
                  "relative grid size-16 place-items-center rounded-full text-lime-foreground shadow-lg transition-colors focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40",
                  guide.listening ? "bg-red-500 text-white" : "bg-lime",
                )}
              >
                {guide.listening && <motion.span className="absolute inset-0 rounded-full bg-red-500/40" animate={{ scale: [1, 1.35], opacity: [0.7, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />}
                {guide.listening || !sttOk ? <MicOff className="relative size-7" /> : <Mic className="relative size-7" />}
              </motion.button>
              <Button variant="ghost" className="min-h-12 min-w-24 justify-end" onClick={guide.skip}>
                {t("ff.join.skip")} <SkipForward className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Room to scroll the form's Next button above the docked guide on phones. */}
      {guide.active && <div aria-hidden className="h-72 sm:hidden" />}
    </>
  );
}
