// Web Speech API wrapper for voice input (farmer listings, grocery lists,
// bulk demands, delivery OTP digits). Chrome/Edge/Android support it;
// elsewhere `supported` is false and callers show a typed fallback.
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import type { MessageKey } from "@/lib/i18n";

// Minimal typings — the Web Speech API is not in TypeScript's DOM lib.
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}
interface SpeechEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

/** Recognition error codes with a translated message (`speech.<code>`). */
const KNOWN_ERRORS = ["not-allowed", "service-not-allowed", "no-speech", "audio-capture", "network", "language-not-supported"];

/**
 * @param onFinal - called with the full transcript when the user stops speaking
 */
export function useSpeech(onFinal?: (transcript: string) => void) {
  const supported = useSyncExternalStore(noop, () => getCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const { t } = useI18n();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  const stop = useCallback(() => recRef.current?.stop(), []);

  /**
   * Starts listening.
   * @param lang - BCP-47 code: hi-IN, kn-IN, ta-IN, te-IN, en-IN
   */
  const start = useCallback((lang: string) => {
    const Ctor = getCtor();
    if (!Ctor) return setErrorCode("unsupported");
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    finalRef.current = "";
    setInterim("");
    setErrorCode(null);
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += `${r[0].transcript} `;
        else text += r[0].transcript;
      }
      setInterim((finalRef.current + text).trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted") setErrorCode(e.error);
    };
    rec.onend = () => {
      setListening(false);
      const said = finalRef.current.trim();
      if (said) onFinalRef.current?.(said);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, []);

  useEffect(() => () => recRef.current?.abort(), []);

  const error =
    errorCode === null
      ? null
      : errorCode === "unsupported" || KNOWN_ERRORS.includes(errorCode)
        ? t(`speech.${errorCode}` as MessageKey)
        : t("speech.error", { code: errorCode });

  return { supported, listening, interim, error, start, stop };
}

/** Speech languages offered across the app. */
export const SPEECH_LANGS = [
  { code: "hi-IN", label: "हिन्दी" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
  { code: "en-IN", label: "English" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
] as const;
