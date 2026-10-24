// State machine behind the Sakhi panel: conversation, avatar
// state, browser speech in/out, the editable "heard" transcript with a
// confidence gate, voice yes/no for a visible confirmation, hands-free
// listening after a question, context (pending follow-up, latest draft /
// demand) sent back to the server, and the first-harvest journey that
// carries on from a voice sign-up (harvest → photo → review → done).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mutate as revalidate } from "swr";
import { useI18n } from "@/components/providers/i18n-provider";
import type { Entities, Intent } from "@/lib/assistant/intents";
import { SPEECH_CODE } from "@/lib/assistant/language";
import { yesNo } from "@/lib/assistant/lexicon";
import { createStt, type SttError, type SttProvider } from "@/lib/assistant/stt";
import { speak, stopSpeaking, voiceMode, type VoiceMode } from "@/lib/assistant/tts";
import type { AssistantReply, Card, DraftCard } from "@/lib/assistant/types";
import { ApiError, sendJSON } from "@/lib/fetcher";
import { translate } from "@/lib/i18n";
import type { AvatarState } from "./avatar";

export interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  card?: Card;
  token?: string;
  intent?: Intent;
  ok?: boolean;
  /** pending → waiting for the farmer; done / cancelled once answered. */
  confirm?: "pending" | "done" | "cancelled";
  speech?: string;
  voiceUnavailable?: boolean;
}

/** The first-harvest journey after a voice sign-up. */
export type JourneyStage = "harvest" | "photo" | "review" | "done";

/** Minimum engine confidence to send a spoken request without a tap. */
export const STT_CONFIDENT = 0.6;
const AUTO_SEND_MS = 1400;
const HANDS_FREE_KEY = "ff-handsfree";

let seq = 0;
const nextId = () => `m${++seq}`;
const store = {
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

/**
 * @param intercept - gets each request first (the order autopilot answers a
 *   "yes" or a buyer's code itself); resolves true when it has replied
 */
export function useFarmerFriend({ autoVoice, intercept }: { autoVoice: boolean; intercept?: React.RefObject<(text: string) => Promise<boolean>> }) {
  const { lang, t } = useI18n();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [avatar, setAvatar] = useState<AvatarState>("idle");
  const [word, setWord] = useState(0);
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState("");
  /** The draft came from speech: show "heard, edit if needed" + Use this. */
  const [heard, setHeard] = useState<{ confidence: number; autoSend: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replyEnglish, setReplyEnglish] = useState(false);
  const [voice, setVoice] = useState<VoiceMode | null>(null);
  const [needTap, setNeedTap] = useState<{ text: string; lang: "en" | "hi" | "kn" } | null>(null);
  const [handsFree, setHandsFreeState] = useState(() => store.get(HANDS_FREE_KEY) === "1");
  const [journey, setJourney] = useState<JourneyStage | null>(null);
  /** Bumped when the first harvest is sent for review (the panel celebrates). */
  const [celebrate, setCelebrate] = useState(0);

  const stt = useRef<SttProvider | null>(null);
  const ctx = useRef<{ pending: { intent: Intent; entities: Entities } | null; lastDraftId: string | null; lastDemandId: string | null }>({ pending: null, lastDraftId: null, lastDemandId: null });
  const lastSpeech = useRef<{ text: string; lang: "en" | "hi" | "kn" } | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  const journeyRef = useRef<JourneyStage | null>(null);
  const handsFreeRef = useRef(handsFree);
  const listenRef = useRef<() => void>(() => {});
  useEffect(() => {
    messagesRef.current = messages;
    journeyRef.current = journey;
    handsFreeRef.current = handsFree;
  });

  const speakLang = replyEnglish ? "en" : lang;

  // How this device can speak the current language (its own voice, a borrowed one, or none).
  useEffect(() => {
    let live = true;
    voiceMode(lang).then((m) => live && setVoice(m));
    return () => {
      live = false;
    };
  }, [lang]);

  const push = useCallback((m: Omit<Msg, "id">) => {
    const msg = { ...m, id: nextId() };
    setMessages((xs) => [...xs, msg]);
    return msg.id;
  }, []);

  /** Speaks text if allowed and possible; marks the message when this device has no voice. Then listens if asked to. */
  const say = useCallback(
    async (text: string, msgId?: string, force = false, langOverride?: "en" | "hi" | "kn", listenAfter = false) => {
      const voiceLang = langOverride ?? speakLang;
      if (autoVoice || force) {
        lastSpeech.current = { text, lang: voiceLang };
        const result = await speak(text, voiceLang, { onStart: () => setAvatar("speaking"), onBoundary: () => setWord((w) => w + 1) });
        setAvatar((a) => (a === "speaking" ? "idle" : a));
        if (result === "no-voice" && msgId) setMessages((xs) => xs.map((m) => (m.id === msgId ? { ...m, voiceUnavailable: true } : m)));
        // Several blocked announcements in a row are all read on the one tap.
        if (result === "blocked") return setNeedTap((prev) => (prev && prev.lang === voiceLang ? { text: `${prev.text} ${text}`, lang: voiceLang } : { text, lang: voiceLang }));
        if (result === "interrupted") return;
      }
      if (listenAfter && handsFreeRef.current) listenRef.current();
    },
    [autoVoice, speakLang],
  );

  /** A short spoken opener ("Okay.", "ಸರಿ.") before answers to a request, taking turns so it never repeats twice running. */
  const ackTurn = useRef(0);
  const withAck = useCallback(
    (r: AssistantReply) => {
      if (!r.ok || r.intent === "HELP" || r.intent === "SMALLTALK" || r.intent === "UNSUPPORTED") return r.speech;
      const acks = translate(speakLang, "ff.ack").split("|");
      return `${acks[ackTurn.current++ % acks.length]} ${r.speech}`;
    },
    [speakLang],
  );

  /** Moves the first-harvest journey along from a reply, and returns what to say instead, if anything. */
  const journeyStep = useCallback(
    (r: AssistantReply): string | null => {
      const stage = journeyRef.current;
      const card = r.card?.type === "draft" ? r.card.draft : null;
      if (!stage || !card) return null;
      if (stage === "harvest" && card.price && card.photos === 0 && card.status === "DRAFT") setJourney("photo");
      if ((stage === "review" || stage === "photo") && r.intent === "PUBLISH_LISTING" && card.status === "PENDING_REVIEW") {
        setJourney("done");
        setCelebrate((c) => c + 1);
        return translate(speakLang, "ff.journey.done");
      }
      return null;
    },
    [speakLang],
  );

  const handleReply = useCallback(
    (r: AssistantReply, prefix?: string) => {
      ctx.current = {
        pending: r.followUp ? { intent: r.followUp.intent, entities: r.followUp.entities } : null,
        lastDraftId: r.context?.lastDraftId ?? ctx.current.lastDraftId,
        lastDemandId: r.context?.lastDemandId ?? ctx.current.lastDemandId,
      };
      const id = push({ role: "assistant", text: r.display, card: r.card, token: r.confirmToken, intent: r.intent, ok: r.ok, confirm: r.needsConfirmation ? "pending" : undefined, speech: r.speech });
      setAvatar(r.needsConfirmation ? "confirm" : r.ok ? "idle" : "error");
      // Keep the farmer's harvest list in step with what was just drafted or sent.
      if (r.card?.type === "draft") void revalidate("/api/batches");
      const instead = journeyStep(r);
      const speech = instead ?? (prefix ? `${prefix} ${r.speech}` : withAck(r));
      void say(speech, id, false, undefined, Boolean(r.followUp || r.needsConfirmation));
    },
    [journeyStep, push, say, withAck],
  );

  const failed = useCallback(
    (e: unknown) => {
      const status = e instanceof ApiError ? e.status : 0;
      const text = status === 401 ? t("ff.sessionExpired") : status === 410 ? t("ff.say.expired") : t("ff.say.error");
      push({ role: "assistant", text, ok: false });
      setAvatar("error");
    },
    [push, t],
  );

  /** Sends one request (typed, chip or "Use this"). */
  const send = useCallback(
    async (raw: string, sttConfidence?: number) => {
      const text = raw.trim();
      if (!text || busy) return;
      if (autoTimer.current) clearTimeout(autoTimer.current);
      setDraft("");
      setHeard(null);
      setNotice(null);
      setNeedTap(null);
      stopSpeaking();
      push({ role: "user", text });
      setBusy(true);
      setAvatar("thinking");
      try {
        // A confirmation card on screen keeps its yes/no; otherwise the autopilot may answer first.
        const confirming = messagesRef.current.some((m) => m.confirm === "pending");
        if (!confirming && intercept?.current && (await intercept.current(text))) return;
        const r = await sendJSON<AssistantReply>("/api/assistant/interpret", {
          text,
          lang,
          ...(replyEnglish && { replyLang: "en" }),
          ...(sttConfidence !== undefined && { sttConfidence }),
          context: ctx.current,
        });
        handleReply(r);
      } catch (e) {
        failed(e);
      } finally {
        setBusy(false);
      }
    },
    [busy, failed, handleReply, intercept, lang, push, replyEnglish],
  );

  const confirm = useCallback(
    async (msgId: string) => {
      const m = messagesRef.current.find((x) => x.id === msgId);
      if (!m?.token || m.confirm !== "pending") return;
      setMessages((xs) => xs.map((x) => (x.id === msgId ? { ...x, confirm: "done" } : x)));
      setBusy(true);
      setAvatar("thinking");
      try {
        handleReply(await sendJSON<AssistantReply>("/api/assistant/confirm", { token: m.token }));
      } catch (e) {
        setMessages((xs) => xs.map((x) => (x.id === msgId ? { ...x, confirm: "pending" } : x)));
        failed(e);
      } finally {
        setBusy(false);
      }
    },
    [failed, handleReply],
  );

  const cancel = useCallback(
    (msgId: string) => {
      setMessages((xs) => xs.map((x) => (x.id === msgId ? { ...x, confirm: "cancelled" } : x)));
      const id = push({ role: "assistant", text: t("ff.say.cancelled"), ok: true });
      setAvatar("idle");
      void say(t("ff.say.cancelled"), id);
    },
    [push, say, t],
  );

  /**
   * Asks the server for a (new) confirmation: after the farmer edits a value
   * on a card (`msgId` is then replaced), or from a card button (`msgId` null).
   * @param prefix - said before the server's reply instead of the usual opener
   */
  const reprepare = useCallback(
    async (msgId: string | null, intent: Intent, entities: Entities, prefix?: string) => {
      if (msgId) setMessages((xs) => xs.map((x) => (x.id === msgId ? { ...x, confirm: "cancelled" } : x)));
      setBusy(true);
      setAvatar("thinking");
      try {
        handleReply(await sendJSON<AssistantReply>("/api/assistant/prepare", { intent, entities, lang: replyEnglish ? "en" : lang, context: ctx.current }), prefix);
      } catch (e) {
        failed(e);
      } finally {
        setBusy(false);
      }
    },
    [failed, handleReply, lang, replyEnglish],
  );

  const sttError = useCallback(
    (e: SttError) => {
      setNotice(e === "not-allowed" ? t("ff.micDenied") : e === "no-speech" ? t("ff.noSpeech") : e === "language-not-supported" ? t("ff.sttLanguage") : e === "unsupported" || e === "not-implemented" ? t("ff.sttUnsupported") : t("ff.say.error"));
      if (e === "not-allowed") setHandsFreeState(false);
      setAvatar(e === "no-speech" ? "idle" : "error");
    },
    [t],
  );

  const startListening = useCallback(() => {
    stopSpeaking();
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (!stt.current) stt.current = createStt();
    if (!stt.current.isAvailable()) return sttError("unsupported");
    setNotice(null);
    setHeard(null);
    setListening(true);
    setAvatar("listening");
    stt.current.start(SPEECH_CODE[lang] as "en-IN" | "hi-IN" | "kn-IN", {
      onInterim: (text) => setDraft(text),
      onFinal: (text, confidence) => {
        // A visible confirmation can be answered by voice ("haan", "ಹೌದು", "no").
        const open = [...messagesRef.current].reverse().find((m) => m.confirm === "pending");
        const answer = open ? yesNo(text) : null;
        if (open && answer) {
          setDraft("");
          if (answer === "yes") void confirm(open.id);
          else cancel(open.id);
          return;
        }
        setDraft(text);
        const autoSend = confidence === 0 ? handsFreeRef.current : confidence >= STT_CONFIDENT;
        setHeard({ confidence, autoSend });
        if (!autoSend) setNotice(t("ff.lowConfidence"));
        else autoTimer.current = setTimeout(() => void send(text, confidence), handsFreeRef.current ? 600 : AUTO_SEND_MS);
      },
      onError: sttError,
      onEnd: () => {
        setListening(false);
        setAvatar((a) => (a === "listening" ? "idle" : a));
      },
    });
  }, [cancel, confirm, lang, send, sttError, t]);
  useEffect(() => {
    listenRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => stt.current?.stop(), []);

  /** Typing into the heard transcript cancels the automatic send. */
  const editDraft = useCallback((v: string) => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setHeard((h) => (h ? { ...h, autoSend: false } : h));
    setDraft(v);
  }, []);

  const stopAudio = useCallback(() => {
    stopSpeaking();
    setAvatar((a) => (a === "speaking" ? "idle" : a));
  }, []);

  const repeatLast = useCallback(() => {
    const last = lastSpeech.current;
    if (last) void say(last.text, undefined, true, last.lang);
  }, [say]);

  /** Speaks after a tap (autoplay was blocked) — never retried automatically. */
  const tapToHear = useCallback(() => {
    const pending = needTap;
    setNeedTap(null);
    if (pending) void say(pending.text, undefined, true, pending.lang, Boolean(ctx.current.pending));
  }, [needTap, say]);

  /** Panel closed: stop the mic and the voice. */
  const shutdown = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    stt.current?.abort();
    stopSpeaking();
    setListening(false);
    setAvatar("idle");
  }, []);

  useEffect(() => () => shutdown(), [shutdown]);

  /** Pushes an assistant message from the client (e.g. the spoken welcome). */
  const announce = useCallback(
    (text: string, langOverride?: "en" | "hi" | "kn", listenAfter = false) => {
      const id = push({ role: "assistant", text, ok: true });
      void say(text, id, true, langOverride, listenAfter);
    },
    [push, say],
  );

  const setHandsFree = useCallback((on: boolean) => {
    store.set(HANDS_FREE_KEY, on ? "1" : "0");
    setHandsFreeState(on);
  }, []);

  /** Order news is spoken one item after another, so a burst isn't cut short. */
  const speechQueue = useRef<Promise<void>>(Promise.resolve());

  /**
   * Says something the farmer didn't ask for (the order autopilot): shown at
   * once, read aloud after whatever is being said (when auto voice is on).
   */
  const agentSay = useCallback(
    (text: string, opts: { ok?: boolean; listenAfter?: boolean } = {}) => {
      const id = push({ role: "assistant", text, ok: opts.ok ?? true });
      setAvatar(opts.ok === false ? "error" : "idle");
      speechQueue.current = speechQueue.current.then(() => say(text, id, false, undefined, opts.listenAfter ?? false)).catch(() => {});
    },
    [push, say],
  );

  /** Carries on from a voice sign-up: greet by name and start listing the first harvest, hands-free. */
  const beginJourney = useCallback(
    (name: string) => {
      setJourney("harvest");
      handsFreeRef.current = true;
      setHandsFreeState(true);
      ctx.current = { ...ctx.current, pending: { intent: "CREATE_LISTING_DRAFT", entities: {} } };
      announce(translate(lang, "ff.journey.hello", { name }), lang, true);
    },
    [announce, lang],
  );

  /**
   * A photo was added to a draft card: during the journey (or hands-free),
   * go straight to "send it for review?".
   */
  const onPhoto = useCallback(
    (d: DraftCard) => {
      void revalidate("/api/batches");
      if (!d.price || d.photos === 0 || d.status !== "DRAFT") return;
      if (!journeyRef.current && !handsFreeRef.current) return;
      if (journeyRef.current === "photo") setJourney("review");
      void reprepare(null, "PUBLISH_LISTING", { draftId: d.id }, translate(speakLang, "ff.journey.photoAdded"));
    },
    [reprepare, speakLang],
  );

  /** Updates a draft card in place (after edits or photo uploads). */
  const updateCard = useCallback((msgId: string, card: Card) => setMessages((xs) => xs.map((m) => (m.id === msgId ? { ...m, card } : m))), []);

  return {
    lang,
    /** The language replies are spoken in (English when this device has no voice for `lang`). */
    speakLang,
    messages,
    avatar,
    word,
    listening,
    draft,
    heard,
    notice,
    busy,
    replyEnglish,
    voice,
    voiceOk: voice === null ? null : voice !== "none",
    needTap,
    handsFree,
    journey,
    celebrate,
    setReplyEnglish,
    setHandsFree,
    send,
    confirm,
    cancel,
    reprepare,
    startListening,
    stopListening,
    editDraft,
    stopAudio,
    repeatLast,
    tapToHear,
    shutdown,
    announce,
    agentSay,
    beginJourney,
    onPhoto,
    updateCard,
    setAvatar,
  };
}
