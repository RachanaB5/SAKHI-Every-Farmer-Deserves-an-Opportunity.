// Text-to-speech for Sakhi.
//
// Kannada is spoken by FoodFlow's own Kannada voice when the server has it
// installed (/api/tts, a native Kannada model), because browsers rarely
// have one. Everything else uses the browser's speechSynthesis.
//
// Picking a device voice: Indian English first for English (names, places and crops
// are pronounced the way farmers say them), then the most natural voice
// (Edge "Natural", Google network, Apple enhanced), and a female voice for
// Sakhi unless the farmer picks a male one. Kannada with neither the server
// voice nor a Kannada voice on the device is read by a Hindi voice from
// Devanagari letters rather than not at all, and the panel says so. Kannada or Hindi text is
// never read by an English voice. Text is spoken sentence by sentence at a
// pace that suits the language.
"use client";

import type { AssistantLang } from "./intents";
import { kannadaToDevanagari } from "./kannada-speech";
import { splitSentences, toSpoken } from "./speech-text";

export type SpeakResult = "spoken" | "no-voice" | "blocked" | "unsupported" | "interrupted";
export type Speed = "slow" | "normal" | "fast";
export type Gender = "female" | "male";
/** native: a voice for the language; borrowed: Kannada read by a Hindi voice; none: text only. */
export type VoiceMode = "native" | "borrowed" | "none";

/** Acceptable voice languages, best first. */
const LANG_CODES: Record<AssistantLang, string[]> = {
  kn: ["kn-in", "kn"],
  hi: ["hi-in", "hi"],
  en: ["en-in", "en-gb", "en-us", "en-au", "en"],
};
/** A comfortable pace per language: Indic voices sound rushed at the default rate. */
const BASE_RATE: Record<AssistantLang, number> = { en: 0.97, hi: 0.93, kn: 0.9 };
const SPEED_FACTOR: Record<Speed, number> = { slow: 0.85, normal: 1, fast: 1.12 };

// Voice names that reveal the speaker (the Web Speech API has no gender field).
const FEMALE = /female|heera|neerja|swara|sapna|kalpana|aditi|raveena|veena|lekha|zira|aria|jenny|hazel|susan|libby|sonia|natasha|samantha|karen|moira|tessa|fiona|victoria|allison|ava\b|kate|serena|kajal|shruti|ananya|^google (हिन्दी|us english)$/i;
const MALE = /\bmale|ravi|prabhat|madhur|gagan|hemant|rishi|david|mark|george|ryan|guy\b|davis|thomas|daniel|alex|fred|oliver|arjun|kunal|aarav/i;
export const genderOf = (v: Pick<SpeechSynthesisVoice, "name">): Gender | null => (FEMALE.test(v.name) ? "female" : MALE.test(v.name) ? "male" : null);

const voiceKey = (lang: AssistantLang) => `ff-voice-${lang}`;
const SPEED_KEY = "ff-voice-speed";
const GENDER_KEY = "ff-voice-gender";
const local = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  },
};

export const ttsSupported = () => typeof window !== "undefined" && (("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined") || typeof Audio !== "undefined");
const deviceTts = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** The pseudo voice id of FoodFlow's server-side Kannada voice. */
export const SERVER_KANNADA = "foodflow:kn";
let serverKn: Promise<boolean> | null = null;
/** Whether the server can speak Kannada (asked once per page; also warms the model). */
export function serverKannada(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  serverKn ??= fetch("/api/tts?status=1&warm=1")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { data?: { kn?: boolean } } | null) => Boolean(j?.data?.kn))
    .catch(() => false);
  return serverKn;
}

/** Kannada goes to the server voice unless the farmer picked one of the device's own Kannada voices. */
async function usesServerVoice(lang: AssistantLang): Promise<boolean> {
  if (lang !== "kn" || !(await serverKannada())) return false;
  const chosen = local.get(voiceKey("kn"));
  if (!chosen || chosen === SERVER_KANNADA) return true;
  const own = deviceTts() ? rankVoices(await loadVoices(), "kn") : [];
  return !own.some((v) => v.voiceURI === chosen);
}

/** Voices load asynchronously in Chrome; resolves once they're known (or after 1.5 s). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!deviceTts()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Whether a voice is one of the modern, human-sounding kind. */
export const isNaturalVoice = (v: Pick<SpeechSynthesisVoice, "name">) => /natural|neural|wavenet|premium|enhanced|google|siri/i.test(v.name);

/** How well a voice suits `lang`, or -1 when it can't speak it. */
function score(v: SpeechSynthesisVoice, lang: AssistantLang, gender: Gender | null): number {
  const code = v.lang.replace("_", "-").toLowerCase();
  const rank = LANG_CODES[lang].findIndex((c) => code === c || code.startsWith(`${c}-`));
  if (rank < 0) return -1;
  let s = 100 - rank * 5;
  if (code === "en-in") s += 60;
  if (/natural|neural|wavenet/i.test(v.name)) s += 40;
  if (/premium|enhanced/i.test(v.name)) s += 30;
  if (/google/i.test(v.name)) s += 25;
  if (/online/i.test(v.name)) s += 10;
  if (/espeak|compact/i.test(v.name)) s -= 60;
  if (!v.localService) s += 5;
  if (gender && genderOf(v) === gender) s += 80;
  return s;
}

/** Voices that can speak `lang`, best first. */
export function rankVoices(voices: SpeechSynthesisVoice[], lang: AssistantLang): SpeechSynthesisVoice[] {
  const gender = getGender();
  return voices
    .map((v) => ({ v, s: score(v, lang, gender) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
}

/** The voices on offer for `lang`: its own, or for Kannada with none installed, Hindi voices that read it. */
function candidates(voices: SpeechSynthesisVoice[], lang: AssistantLang): { list: SpeechSynthesisVoice[]; borrowed: boolean } {
  const own = rankVoices(voices, lang);
  if (own.length || lang !== "kn") return { list: own, borrowed: false };
  return { list: rankVoices(voices, "hi"), borrowed: true };
}

/** The voice to use for `lang` (the farmer's pick when still installed) and whether it is borrowed. */
export function voicePlan(voices: SpeechSynthesisVoice[], lang: AssistantLang): { voice: SpeechSynthesisVoice; borrowed: boolean } | null {
  const { list, borrowed } = candidates(voices, lang);
  const chosen = local.get(voiceKey(lang));
  const voice = list.find((v) => v.voiceURI === chosen) ?? list[0];
  return voice ? { voice, borrowed } : null;
}

/** The voice that would be used for `lang`, or null. */
export const pickVoice = (voices: SpeechSynthesisVoice[], lang: AssistantLang) => voicePlan(voices, lang)?.voice ?? null;

export interface VoiceOption {
  uri: string;
  label: string;
  natural: boolean;
  gender: Gender | null;
}

/** "Microsoft Sapna Online (Natural) - Kannada (India)" → "Sapna (Natural)". */
const shortName = (name: string) =>
  name
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s+Online/i, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();

/** Voices offered in settings for `lang`, best first, which one is in use and whether they are borrowed. */
export async function voiceOptions(lang: AssistantLang): Promise<{ options: VoiceOption[]; current: string | null; borrowed: boolean }> {
  const voices = await loadVoices();
  const { list, borrowed } = candidates(voices, lang);
  const options = list.map((v) => ({ uri: v.voiceURI, label: shortName(v.name), natural: isNaturalVoice(v), gender: genderOf(v) }));
  if (lang === "kn" && (await serverKannada())) {
    // FoodFlow's Kannada voice first; Hindi voices reading Kannada are no longer needed.
    const own = borrowed ? [] : options;
    const server: VoiceOption = { uri: SERVER_KANNADA, label: "ಸಖಿ · FoodFlow", natural: true, gender: "female" };
    return { options: [server, ...own], current: (await usesServerVoice("kn")) ? SERVER_KANNADA : (voicePlan(voices, lang)?.voice.voiceURI ?? null), borrowed: false };
  }
  return { options, current: voicePlan(voices, lang)?.voice.voiceURI ?? null, borrowed };
}

export const setVoiceChoice = (lang: AssistantLang, uri: string | null) => local.set(voiceKey(lang), uri);
export const getSpeed = (): Speed => {
  const s = local.get(SPEED_KEY);
  return s === "slow" || s === "fast" ? s : "normal";
};
export const setSpeed = (s: Speed) => local.set(SPEED_KEY, s === "normal" ? null : s);
/** Sakhi speaks with a female voice unless the farmer picks a male one. */
export const getGender = (): Gender => (local.get(GENDER_KEY) === "male" ? "male" : "female");
/** Prefers a female or male voice from now on (a specific voice picked earlier gives way). */
export function setGender(g: Gender) {
  local.set(GENDER_KEY, g === "male" ? g : null);
  for (const l of ["en", "hi", "kn"] as const) local.set(voiceKey(l), null);
}

/** How this device can speak `lang`. */
export async function voiceMode(lang: AssistantLang): Promise<VoiceMode> {
  if (await usesServerVoice(lang)) return "native";
  if (!deviceTts()) return "none";
  const plan = voicePlan(await loadVoices(), lang);
  return !plan ? "none" : plan.borrowed ? "borrowed" : "native";
}

/** Whether this device can speak the language at all. */
export const canSpeak = async (lang: AssistantLang) => (await voiceMode(lang)) !== "none";

/** Bumped by stopSpeaking() so a multi-sentence reply stops between sentences too. */
let generation = 0;
/** Chrome drops utterances that get garbage-collected mid-speech (and never fires onend); keep them alive. */
const speaking = new Set<SpeechSynthesisUtterance>();

function speakOne(text: string, voice: SpeechSynthesisVoice, rate: number, onStart?: () => void, onBoundary?: () => void): Promise<SpeakResult> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    speaking.add(u);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    u.pitch = 1;
    let started = false;
    const done = (r: SpeakResult) => {
      speaking.delete(u);
      resolve(r);
    };
    u.onstart = () => {
      started = true;
      onStart?.();
    };
    u.onboundary = () => onBoundary?.();
    u.onend = () => done("spoken");
    u.onerror = (e) => done(e.error === "not-allowed" ? "blocked" : e.error === "interrupted" || e.error === "canceled" ? "interrupted" : started ? "spoken" : "blocked");
    speechSynthesis.speak(u);
  });
}

/**
 * Speaks `text` in `lang`, sentence by sentence.
 * @param onBoundary - fires per word (drives the avatar's mouth)
 * @returns how it went; "blocked" means the browser needs a tap first (autoplay policy)
 */
export async function speak(text: string, lang: AssistantLang, opts: { onStart?: () => void; onBoundary?: () => void } = {}): Promise<SpeakResult> {
  if (!ttsSupported()) return "unsupported";
  if (await usesServerVoice(lang)) {
    stopSpeaking();
    const mine = generation;
    const r = await speakServer(splitSentences(toSpoken(text, lang)), mine, opts);
    if (r !== "unavailable") return r;
    // The server voice failed (offline, removed): carry on with the device.
    serverKn = Promise.resolve(false);
  }
  if (!deviceTts()) return "unsupported";
  const plan = voicePlan(await loadVoices(), lang);
  if (!plan) return "no-voice";
  speechSynthesis.cancel();
  // Chrome can leave the queue paused after a cancel.
  speechSynthesis.resume();
  const mine = ++generation;
  const rate = BASE_RATE[lang] * SPEED_FACTOR[getSpeed()];
  let spoken = toSpoken(text, lang);
  if (plan.borrowed) spoken = kannadaToDevanagari(spoken);
  for (const [i, sentence] of splitSentences(spoken).entries()) {
    if (mine !== generation) return "interrupted";
    const r = await speakOne(sentence, plan.voice, rate, i === 0 ? opts.onStart : undefined, opts.onBoundary);
    if (r !== "spoken") return r;
  }
  return mine === generation ? "spoken" : "interrupted";
}

/** Stops any speech in progress. */
export function stopSpeaking() {
  generation++;
  stopAudio?.();
  if (deviceTts()) speechSynthesis.cancel();
}

// ── Server voice (Kannada) ─────────────────────────────────────────────
/** Sentence audio already fetched this page, as object URLs. */
const audioCache = new Map<string, Promise<string | null>>();
let stopAudio: (() => void) | null = null;

function sentenceAudio(sentence: string): Promise<string | null> {
  let hit = audioCache.get(sentence);
  if (!hit) {
    hit = fetch(`/api/tts?lang=kn&text=${encodeURIComponent(sentence)}`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    hit.then((u) => u === null && audioCache.delete(sentence));
    audioCache.set(sentence, hit);
    if (audioCache.size > 80) audioCache.delete(audioCache.keys().next().value!);
  }
  return hit;
}

function playAudio(url: string, onStart?: () => void, onBoundary?: () => void): Promise<SpeakResult> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = SPEED_FACTOR[getSpeed()];
    audio.preservesPitch = true;
    // The avatar's mouth moves at a speaking pace while the audio plays.
    let mouth: ReturnType<typeof setInterval> | null = null;
    const done = (r: SpeakResult) => {
      if (mouth) clearInterval(mouth);
      if (stopAudio === stop) stopAudio = null;
      resolve(r);
    };
    const stop = () => {
      audio.pause();
      done("interrupted");
    };
    stopAudio = stop;
    audio.onplaying = () => {
      onStart?.();
      if (onBoundary && !mouth) mouth = setInterval(onBoundary, 230);
    };
    audio.onended = () => done("spoken");
    audio.onerror = () => done("blocked");
    audio.play().catch((e: unknown) => done(e instanceof DOMException && e.name === "NotAllowedError" ? "blocked" : "interrupted"));
  });
}

/** Plays each sentence from the server, fetching the next while the current one plays. */
async function speakServer(sentences: string[], mine: number, opts: { onStart?: () => void; onBoundary?: () => void }): Promise<SpeakResult | "unavailable"> {
  if (!sentences.length) return "spoken";
  let next = sentenceAudio(sentences[0]);
  for (let i = 0; i < sentences.length; i++) {
    const url = await next;
    if (mine !== generation) return "interrupted";
    if (!url) return i === 0 ? "unavailable" : "spoken";
    if (i + 1 < sentences.length) next = sentenceAudio(sentences[i + 1]);
    const r = await playAudio(url, i === 0 ? opts.onStart : undefined, opts.onBoundary);
    if (r !== "spoken") return r;
  }
  return mine === generation ? "spoken" : "interrupted";
}
