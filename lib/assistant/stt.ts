// Speech-to-text providers for Sakhi. The browser provider uses
// the Web Speech API (on-device or the browser vendor's service); FoodFlow
// never records, stores or uploads audio. A server provider (e.g. AI4Bharat
// IndicConformer) is declared for later but NOT implemented.
"use client";

export type SttLang = "en-IN" | "hi-IN" | "kn-IN";
export type SttError = "unsupported" | "not-allowed" | "no-speech" | "audio-capture" | "network" | "language-not-supported" | "not-implemented" | "other";

export interface SttHandlers {
  /** Live partial text while the farmer speaks. */
  onInterim?: (text: string) => void;
  /** Final text and the engine's confidence (0–1; 0 means "not reported"). */
  onFinal: (text: string, confidence: number) => void;
  onError?: (error: SttError) => void;
  onEnd?: () => void;
}

export interface SttProvider {
  readonly name: string;
  isAvailable(): boolean;
  start(lang: SttLang, handlers: SttHandlers): void;
  stop(): void;
  abort(): void;
}

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
}
interface RecognitionEvent {
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const KNOWN: SttError[] = ["not-allowed", "no-speech", "audio-capture", "network", "language-not-supported"];

/** Web Speech API recogniser; stops by itself after a pause (silence). */
export class BrowserStt implements SttProvider {
  readonly name = "browser";
  private rec: Recognition | null = null;

  isAvailable() {
    return ctor() !== null;
  }

  start(lang: SttLang, h: SttHandlers) {
    const Ctor = ctor();
    if (!Ctor) {
      h.onError?.("unsupported");
      h.onEnd?.();
      return;
    }
    this.abort();
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    let confidence = 0;
    let finals = 0;
    rec.onresult = (e) => {
      let interim = "";
      finalText = "";
      let sum = 0;
      finals = 0;
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finalText += `${r[0].transcript} `;
          sum += r[0].confidence || 0;
          finals += 1;
        } else interim += r[0].transcript;
      }
      confidence = finals ? sum / finals : 0;
      h.onInterim?.((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") return;
      h.onError?.(e.error === "service-not-allowed" ? "not-allowed" : KNOWN.includes(e.error as SttError) ? (e.error as SttError) : "other");
    };
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      const text = finalText.trim();
      if (text) h.onFinal(text, confidence);
      h.onEnd?.();
    };
    this.rec = rec;
    rec.start();
  }

  stop() {
    this.rec?.stop();
  }

  /** Stops at once and drops whatever was heard: an aborted session never reports back. */
  abort() {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = null;
    rec.abort();
  }
}

/**
 * Placeholder for a server-side Indic speech model (AI4Bharat
 * IndicConformer). NOT IMPLEMENTED: it reports itself unavailable so the
 * panel falls back to browser speech or typing. Enable only once a real
 * endpoint exists (NEXT_PUBLIC_STT_PROVIDER=server).
 */
export class ServerSttProvider implements SttProvider {
  readonly name = "server (not implemented)";
  isAvailable() {
    return false;
  }
  start(_lang: SttLang, h: SttHandlers) {
    h.onError?.("not-implemented");
    h.onEnd?.();
  }
  stop() {}
  abort() {}
}

/** Configured provider; falls back to the browser when the server one is unavailable. */
export function createStt(): SttProvider {
  if (process.env.NEXT_PUBLIC_STT_PROVIDER === "server") {
    const server = new ServerSttProvider();
    if (server.isAvailable()) return server;
  }
  return new BrowserStt();
}
