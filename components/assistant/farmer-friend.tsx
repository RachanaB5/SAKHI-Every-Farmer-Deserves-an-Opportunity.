// Sakhi: the floating sprout button and its panel — a right-side
// drawer on desktop, an 85vh bottom sheet on phones. Talk or type; the
// sprout answers with real data, asks before changing anything, and
// greets new farmers once in their language. After a voice sign-up it opens
// by itself and walks the farmer through their first harvest, hands-free.
"use client";

import { Check, Mic, MicOff, Repeat, Send, Settings2, Square, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ClientOnly } from "@/components/common/client-only";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useIsDesktop } from "@/hooks/use-media-query";
import type { AssistantLang } from "@/lib/assistant/intents";
import { clearJourney, peekJourney } from "@/lib/assistant/journey";
import { createStt } from "@/lib/assistant/stt";
import { ttsSupported } from "@/lib/assistant/tts";
import { sendJSON } from "@/lib/fetcher";
import { translate, type Lang, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FarmerFriendAvatar } from "./avatar";
import { MessageCard } from "./cards";
import { useFarmerFriend, type JourneyStage } from "./use-farmer-friend";
import { VoiceSettings } from "./voice-settings";

interface Settings {
  welcomeSeen: boolean;
  autoVoice: boolean;
  language: string;
  suggested: AssistantLang[];
}

const HIDDEN_KEY = "ff-assistant-hidden";
const MIC_KEY = "ff-mic-explained";
const LANG_LABEL: Record<AssistantLang, string> = { en: "EN", kn: "ಕನ್ನಡ", hi: "हिंदी" };
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

/** Opens the assistant from elsewhere (e.g. the top-bar menu). */
export const openFarmerFriend = () => window.dispatchEvent(new Event("ff:open"));

/** Farmer-only floating assistant. */
export function FarmerFriend() {
  return (
    <ClientOnly>
      <FarmerFriendInner />
    </ClientOnly>
  );
}

function FarmerFriendInner() {
  const { t } = useI18n();
  const pathname = usePathname();
  const desktop = useIsDesktop();
  const { data: settings, mutate } = useSWR<Settings>("/api/assistant/settings");
  // A voice sign-up carries straight on here: open, greet by name and list the first harvest.
  const [journey] = useState(() => peekJourney());
  const [userOpen, setUserOpen] = useState(() => journey !== null);
  const [hidden, setHidden] = useState(() => journey === null && store.get(HIDDEN_KEY) === "1");
  const [welcomeDone, setWelcomeDone] = useState(() => journey !== null);
  const [replayWelcome, setReplayWelcome] = useState(false);
  const autoVoice = settings?.autoVoice ?? true;
  const ff = useFarmerFriend({ autoVoice });

  const { beginJourney } = ff;
  const journeyStarted = useRef(false);
  useEffect(() => {
    if (!journey || journeyStarted.current) return;
    journeyStarted.current = true;
    clearJourney();
    store.set(HIDDEN_KEY, null);
    void sendJSON("/api/assistant/settings", { welcomeSeen: true }, "PATCH").then(() => mutate());
    beginJourney(journey.name);
  }, [journey, beginJourney, mutate]);

  // The one-time welcome opens by itself on the farmer's home page.
  const autoWelcome = !!settings && !settings.welcomeSeen && !welcomeDone && pathname === "/farmer";
  const showWelcome = autoWelcome || replayWelcome;
  const open = (userOpen || showWelcome) && !hidden;

  useEffect(() => {
    const onOpen = () => {
      store.set(HIDDEN_KEY, null);
      setHidden(false);
      setUserOpen(true);
    };
    window.addEventListener("ff:open", onOpen);
    return () => window.removeEventListener("ff:open", onOpen);
  }, []);

  const close = useCallback(() => {
    ff.shutdown();
    setUserOpen(false);
    setReplayWelcome(false);
    if (autoWelcome) {
      setWelcomeDone(true);
      void sendJSON("/api/assistant/settings", { welcomeSeen: true }, "PATCH").then(() => mutate());
    }
  }, [autoWelcome, ff, mutate]);

  const panel = (
    <Panel
      ff={ff}
      settings={settings}
      showWelcome={showWelcome}
      onWelcomeDone={() => {
        // Keep the panel open: the farmer just chose to start.
        setUserOpen(true);
        setWelcomeDone(true);
        setReplayWelcome(false);
        void sendJSON("/api/assistant/settings", { welcomeSeen: true }, "PATCH").then(() => mutate());
      }}
      onClose={close}
      onToggleVoice={(v) => void sendJSON<Settings>("/api/assistant/settings", { autoVoice: v }, "PATCH").then((s) => mutate(s, { revalidate: false }))}
      onReplayWelcome={() => setReplayWelcome(true)}
      onHide={() => {
        store.set(HIDDEN_KEY, "1");
        setHidden(true);
        close();
      }}
    />
  );

  // Sit above the farmer home's big "+" button; elsewhere use the corner.
  const onHome = pathname === "/farmer";
  return (
    <>
      <AnimatePresence>
        {!open && !hidden && (
          <motion.button
            type="button"
            onClick={() => setUserOpen(true)}
            aria-label={t("ff.open")}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            whileTap={{ scale: 0.92 }}
            className={cn(
              "fixed right-4 z-30 grid size-16 place-items-center rounded-full border-4 border-background bg-card shadow-[0_14px_34px_-12px_rgba(0,0,0,0.5)] print:hidden",
              onHome ? "bottom-[calc(6.75rem+env(safe-area-inset-bottom))] sm:right-8 sm:bottom-32" : "bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:right-8 sm:bottom-8",
            )}
          >
            <FarmerFriendAvatar state={ff.avatar === "speaking" ? "speaking" : "idle"} word={ff.word} size={52} />
          </motion.button>
        )}
      </AnimatePresence>

      {desktop ? (
        <AnimatePresence>
          {open && (
            <motion.aside
              role="dialog"
              aria-label={t("ff.name")}
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              onKeyDown={(e) => e.key === "Escape" && close()}
              className="fixed top-0 right-0 bottom-0 z-50 flex w-[380px] flex-col border-l bg-background shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.35)] print:hidden"
            >
              {panel}
            </motion.aside>
          )}
        </AnimatePresence>
      ) : (
        <Drawer open={open} onOpenChange={(o) => (o ? setUserOpen(true) : close())}>
          <DrawerContent className="h-[85vh] max-h-[85vh] p-0">
            <DrawerTitle className="sr-only">{t("ff.name")}</DrawerTitle>
            <DrawerDescription className="sr-only">{t("ff.welcome.body")}</DrawerDescription>
            {panel}
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}

type FF = ReturnType<typeof useFarmerFriend>;

function Panel({
  ff,
  settings,
  showWelcome,
  onWelcomeDone,
  onClose,
  onToggleVoice,
  onReplayWelcome,
  onHide,
}: {
  ff: FF;
  settings: Settings | undefined;
  showWelcome: boolean;
  onWelcomeDone: () => void;
  onClose: () => void;
  onToggleVoice: (v: boolean) => void;
  onReplayWelcome: () => void;
  onHide: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [micExplain, setMicExplain] = useState(false);
  const [sttOk] = useState(() => createStt().isAvailable());
  const [ttsOk] = useState(() => ttsSupported());
  const stateKey = `ff.state.${ff.avatar}` as MessageKey;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [ff.messages.length, ff.busy]);

  function mic() {
    if (ff.listening) return ff.stopListening();
    if (store.get(MIC_KEY) !== "1") return setMicExplain(true);
    ff.startListening();
  }
  function allowMic() {
    store.set(MIC_KEY, "1");
    setMicExplain(false);
    ff.startListening();
  }
  const chips: { key: MessageKey; say: MessageKey }[] = [
    { key: "ff.chip.list", say: "ff.chip.list.say" },
    { key: "ff.chip.earnings", say: "ff.chip.earnings.say" },
    { key: "ff.chip.stock", say: "ff.chip.stock.say" },
    { key: "ff.chip.bulk", say: "ff.chip.bulk.say" },
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {ff.celebrate > 0 && <Celebration key={ff.celebrate} />}
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <FarmerFriendAvatar state={ff.avatar} word={ff.word} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{t("ff.name")}</p>
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {t(stateKey)}
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label={t("ff.settings")}>
              <Settings2 className="size-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-[70vh] w-72 space-y-3 overflow-y-auto">
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              {t("ff.autoVoice")}
              <Switch checked={settings?.autoVoice ?? true} onCheckedChange={onToggleVoice} />
            </label>
            {sttOk && (
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                {t("ff.handsFree")}
                <Switch checked={ff.handsFree} onCheckedChange={ff.setHandsFree} />
              </label>
            )}
            {ttsOk && <VoiceSettings lang={ff.replyEnglish ? "en" : (lang as AssistantLang)} onSpeaking={(on) => ff.setAvatar(on ? "speaking" : "idle")} />}
            <Button variant="outline" className="min-h-11 w-full" onClick={onReplayWelcome}>
              {t("ff.replayWelcome")}
            </Button>
            <Button variant="ghost" className="min-h-11 w-full text-muted-foreground" onClick={onHide}>
              {t("ff.hide")}
            </Button>
            <p className="text-xs text-muted-foreground">
              <b className="text-foreground">{t("ff.privacy")}.</b> {t("ff.micExplain")}
            </p>
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon" className="size-11" onClick={onClose} aria-label={t("ff.minimise")}>
          <X className="size-5" />
        </Button>
      </div>

      {ff.journey && <JourneyStrip stage={ff.journey} />}

      {/* Language */}
      <div className="flex items-center gap-1.5 border-b px-4 py-2" role="radiogroup" aria-label={t("menu.language")}>
        {(["en", "kn", "hi"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            onClick={() => setLang(l as Lang)}
            className={cn("min-h-11 flex-1 rounded-xl text-sm font-medium transition-colors", lang === l ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      {/* Conversation */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite" aria-relevant="additions">
        {showWelcome ? (
          <Welcome settings={settings} onStart={onWelcomeDone} ff={ff} />
        ) : (
          ff.messages.length === 0 && (
            <div className="rounded-2xl bg-muted/60 p-4 text-sm">
              <p className="font-medium">{t("ff.say.smalltalk")}</p>
              <p className="mt-1 text-muted-foreground">{t("ff.say.help")}</p>
            </div>
          )
        )}
        {ff.messages.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug", m.role === "user" ? "rounded-br-md bg-foreground text-background" : m.ok === false ? "rounded-bl-md bg-destructive/10" : "rounded-bl-md bg-muted")}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.voiceUnavailable && <p className="mt-1.5 text-xs text-muted-foreground">🔇 {t("ff.voiceUnavailable")}</p>}
              <MessageCard msg={m} actions={{ confirm: ff.confirm, cancel: ff.cancel, reprepare: ff.reprepare, updateCard: ff.updateCard, onPhoto: ff.onPhoto, highlightPhoto: ff.journey === "photo", busy: ff.busy }} />
            </div>
          </motion.div>
        ))}
        {ff.busy && (
          <div className="flex gap-1 px-1" aria-label={t("ff.state.thinking")}>
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="size-2 rounded-full bg-muted-foreground/50" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </div>
        )}
        {ff.needTap && (
          <Button size="lg" className="min-h-14 w-full text-base" onClick={ff.tapToHear}>
            🔊 {t("ff.tapToHear")}
          </Button>
        )}
      </div>

      {/* Voice notices */}
      {ff.voice === "borrowed" && !ff.replyEnglish && <p className="border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground">{t("ff.voice.borrowed")}</p>}
      {ff.voiceOk === false && lang !== "en" && (
        <div className="flex items-center justify-between gap-3 border-t bg-warning/10 px-4 py-2 text-xs">
          <span>{t("ff.voiceUnavailable")}</span>
          <label className="flex shrink-0 items-center gap-2">
            {t("ff.replyInEnglish")}
            <Switch checked={ff.replyEnglish} onCheckedChange={ff.setReplyEnglish} />
          </label>
        </div>
      )}

      {/* Composer */}
      <div className="border-t px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {micExplain ? (
          <div className="rounded-2xl border bg-card p-3 text-sm">
            <p>{t("ff.micExplain")}</p>
            <div className="mt-3 flex gap-2">
              <Button className="min-h-11 flex-1" onClick={allowMic}>
                <Mic /> {t("ff.micAllow")}
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={() => setMicExplain(false)}>
                {t("ff.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {!showWelcome && ff.messages.length < 2 && (
              <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
                {chips.map((c) => (
                  <button key={c.key} type="button" disabled={ff.busy} onClick={() => ff.send(t(c.say))} className="min-h-11 shrink-0 rounded-full border bg-background px-4 text-sm whitespace-nowrap hover:bg-muted">
                    {t(c.key)}
                  </button>
                ))}
              </div>
            )}
            {(ff.notice || (!sttOk && ff.messages.length === 0)) && <p className="mb-2 text-xs text-muted-foreground" role="status">{ff.notice ?? t("ff.sttUnsupported")}</p>}
            {ff.heard && <p className="mb-1 text-xs font-medium text-muted-foreground">{t("ff.heard")}</p>}
            <div className={cn("flex items-end gap-2 rounded-2xl border bg-background p-1.5", ff.heard && "border-lime ring-2 ring-lime/30", ff.listening && "border-red-400")}>
              <textarea
                ref={inputRef}
                value={ff.draft}
                onChange={(e) => ff.editDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ff.send(ff.draft, ff.heard?.confidence);
                  }
                }}
                rows={1}
                placeholder={ff.listening ? t("ff.state.listening") : t("ff.placeholder")}
                aria-label={t("ff.placeholder")}
                className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none"
              />
              <Button size={ff.heard ? "default" : "icon"} className={cn("min-h-11 shrink-0", !ff.heard && "size-11")} disabled={ff.busy || !ff.draft.trim()} onClick={() => ff.send(ff.draft, ff.heard?.confidence)} aria-label={ff.heard ? t("ff.useThis") : t("ff.send")}>
                <Send />
                {ff.heard && t("ff.useThis")}
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="ghost" size="icon" className="size-12" onClick={ff.stopAudio} disabled={!ttsOk} aria-label={t("ff.stopAudio")}>
                <Square className="size-5" />
              </Button>
              <motion.button
                type="button"
                onClick={mic}
                disabled={!sttOk || ff.busy}
                whileTap={{ scale: 0.92 }}
                aria-label={ff.listening ? t("ff.micStop") : t("ff.mic")}
                aria-pressed={ff.listening}
                className={cn(
                  "relative grid size-16 place-items-center rounded-full text-lime-foreground shadow-lg transition-colors focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40",
                  ff.listening ? "bg-red-500 text-white" : "bg-lime",
                )}
              >
                {ff.listening && <motion.span className="absolute inset-0 rounded-full bg-red-500/40" animate={{ scale: [1, 1.35], opacity: [0.7, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />}
                {sttOk ? ff.listening ? <MicOff className="relative size-7" /> : <Mic className="relative size-7" /> : <MicOff className="size-7" />}
              </motion.button>
              <Button variant="ghost" size="icon" className="size-12" onClick={ff.repeatLast} disabled={!ttsOk} aria-label={t("ff.repeat")}>
                <Repeat className="size-5" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One-time welcome: pick the language (suggested first), then start. */
function Welcome({ settings, onStart, ff }: { settings: Settings | undefined; onStart: () => void; ff: FF }) {
  const { t, lang, setLang } = useI18n();
  const suggested = settings?.suggested ?? ["kn", "en", "hi"];
  const [choice, setChoice] = useState<AssistantLang>(() => (settings && settings.language !== "en" ? (settings.language as AssistantLang) : suggested[0]));
  const tried = useRef(false);

  // Try to greet out loud once; if autoplay is blocked the panel offers "Tap to hear".
  useEffect(() => {
    if (tried.current || !(settings?.autoVoice ?? true)) return;
    tried.current = true;
    ff.announce(translate(lang, "ff.welcome.spoken"), lang);
  }, [ff, lang, settings?.autoVoice]);

  return (
    <div className="rounded-3xl border bg-card p-4">
      <div className="flex justify-center">
        <FarmerFriendAvatar state={ff.avatar === "speaking" ? "speaking" : "idle"} word={ff.word} size={96} />
      </div>
      <p className="mt-2 text-center text-lg font-semibold">{translate(choice, "ff.welcome.title")}</p>
      <p className="mt-1 text-center text-sm text-muted-foreground">{translate(choice, "ff.welcome.body")}</p>
      <p className="mt-4 text-sm font-medium">{t("ff.welcome.pickLang")}</p>
      <div className="mt-2 space-y-2" role="radiogroup" aria-label={t("ff.welcome.pickLang")}>
        {suggested.map((l, i) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={choice === l}
            onClick={() => setChoice(l)}
            className={cn("flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left", choice === l ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
          >
            <span className="font-medium">{l === "en" ? "English" : l === "kn" ? "ಕನ್ನಡ (Kannada)" : "हिंदी (Hindi)"}</span>
            {i === 0 && <span className={cn("text-xs", choice === l ? "text-background/70" : "text-muted-foreground")}>{t("ff.welcome.suggested")}</span>}
          </button>
        ))}
      </div>
      <Button
        size="lg"
        className="mt-4 min-h-12 w-full text-base"
        onClick={() => {
          setLang(choice as Lang);
          onStart();
          ff.announce(translate(choice, "ff.say.help"), choice);
        }}
      >
        {translate(choice, "ff.welcome.start")}
      </Button>
    </div>
  );
}

const JOURNEY_STEPS = ["account", "harvest", "photo", "review"] as const;
const STAGE_INDEX: Record<JourneyStage, number> = { harvest: 1, photo: 2, review: 3, done: 4 };

/** Progress of the first harvest after a voice sign-up: account → harvest → photo → review. */
function JourneyStrip({ stage }: { stage: JourneyStage }) {
  const { t } = useI18n();
  const at = STAGE_INDEX[stage];
  return (
    <div className="border-b bg-lime/10 px-4 py-2.5">
      <p className="text-xs font-semibold">{t("ff.journey.title")}</p>
      <ol className="mt-1.5 grid grid-cols-4 gap-1.5" aria-label={t("ff.journey.title")}>
        {JOURNEY_STEPS.map((s, i) => (
          <li key={s} aria-current={i === at ? "step" : undefined} className="min-w-0">
            <motion.span layout className={cn("block h-1.5 rounded-full", i < at ? "bg-foreground" : i === at ? "bg-lime" : "bg-muted")} />
            <span className={cn("mt-1 flex items-center gap-0.5 truncate text-[11px]", i === at ? "font-semibold" : "text-muted-foreground")}>
              {i < at && <Check className="size-3 shrink-0" strokeWidth={3} />}
              {t(`ff.journey.s.${s}`)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const CONFETTI = ["🌱", "🍅", "✨", "🧅", "🥕", "🎉", "🌾", "🥬", "✨", "🍆", "🌱", "🎉", "🥔", "✨"];

/** A short burst of produce and sparkles when the first harvest is sent for review. */
function Celebration() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {CONFETTI.map((e, i) => (
        <motion.span
          key={i}
          className="absolute bottom-24 text-2xl"
          style={{ left: `${6 + ((i * 37) % 88)}%` }}
          initial={{ y: 0, opacity: 0, scale: 0.6, rotate: 0 }}
          animate={{ y: -260 - ((i * 53) % 160), opacity: [0, 1, 1, 0], scale: 1, rotate: ((i % 2 ? 1 : -1) * (20 + ((i * 17) % 40))) }}
          transition={{ duration: 1.8 + (i % 4) * 0.2, delay: (i % 5) * 0.07, ease: "easeOut" }}
        >
          {e}
        </motion.span>
      ))}
    </div>
  );
}
