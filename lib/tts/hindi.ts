// Sakhi's Hindi voice, spoken on the server: SYSPIN's open Hindi female VITS
// model (IISc Bangalore, CC BY 4.0), built by `npm run voice:hindi`. Device
// Hindi voices range from natural (Edge, Android) to robotic (many desktops),
// so the browser uses this one unless the device has a natural Hindi voice or
// the farmer picked one (lib/assistant/tts.ts). Numbers become Hindi words,
// English words and names are written in Devanagari, and the shared engine
// (vits.ts) speaks and caches the result.
import "server-only";
import path from "node:path";
import { allFaqAnswers } from "@/lib/assistant/faq";
import { hindiNumbersToWords } from "@/lib/assistant/hindi-speech";
import { kannadaToDevanagari } from "@/lib/assistant/kannada-speech";
import { LINES, SCRIPT, type L3 } from "@/lib/assistant/signup-script";
import { splitSentences, toSpoken } from "@/lib/assistant/speech-text";
import { soundOut } from "./latin-kannada";
import { vitsVoice } from "./vits";

const DIR = process.env.HINDI_VOICE_DIR?.trim() || path.join(process.cwd(), "models", "hi-female");
const voice = vitsVoice(DIR);

/** Whether the exported model is on disk. */
export function hindiVoiceAvailable() {
  return voice.available();
}

/** English words Sakhi says often, spelled the way Hindi speakers say them. */
const WORDS: Record<string, string> = {
  foodflow: "फ़ूडफ़्लो",
  sakhi: "सखी",
  razorpay: "रेज़रपे",
  google: "गूगल",
  whatsapp: "व्हाट्सऐप",
  app: "ऐप",
  online: "ऑनलाइन",
  offline: "ऑफ़लाइन",
  ok: "ओके",
  okay: "ओके",
  pin: "पिन",
  code: "कोड",
  order: "ऑर्डर",
  delivery: "डिलीवरी",
  pickup: "पिकअप",
  listing: "लिस्टिंग",
  kg: "किलो",
  km: "किलोमीटर",
  gowda: "गौड़ा",
};
/** Letter names, for acronyms and spelled-out codes ("U P I", "F F 7 K"). */
const LETTERS: Record<string, string> = {
  A: "ए", B: "बी", C: "सी", D: "डी", E: "ई", F: "एफ़", G: "जी", H: "एच", I: "आई", J: "जे", K: "के", L: "एल", M: "एम",
  N: "एन", O: "ओ", P: "पी", Q: "क्यू", R: "आर", S: "एस", T: "टी", U: "यू", V: "वी", W: "डब्ल्यू", X: "एक्स", Y: "वाई", Z: "ज़ेड",
};

/** One English word in Devanagari: known spelling, letter names for acronyms, else by sound. */
function latinWordToHindi(word: string): string {
  const known = WORDS[word.toLowerCase()];
  if (known) return known;
  if (/^[A-Z]{1,4}$/.test(word)) return Array.from(word, (c) => LETTERS[c]).join("");
  // The Kannada voice's sound rules give Kannada letters, which map one-to-one to
  // Devanagari; Hindi doesn't write the final halant (रमेश, not रमेश्).
  return kannadaToDevanagari(soundOut(word.toLowerCase())).replace(/्$/, "");
}

/**
 * Text as the model needs it: Devanagari letters only, numbers as Hindi words,
 * English words and names written in Devanagari.
 */
export function prepareHindi(text: string): string {
  return hindiNumbersToWords(text.normalize("NFC"))
    .replace(/[A-Za-z][A-Za-z']*/g, latinWordToHindi)
    .replace(/;/g, ",")
    .replace(/-/g, " ")
    .replace(/:/g, ",")
    .replace(/[<>()[\]"]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Speaks `text` in Hindi.
 * @returns a 22.05 kHz mono WAV
 */
export function synthesizeHindi(text: string): Promise<Buffer> {
  return voice.speak(prepareHindi(text));
}

/** Sakhi's fixed Hindi sentences, split the way the browser sends them. */
function fixedSentences(): string[] {
  const lines: L3[] = [...SCRIPT.flat().map((q) => q.ask), ...Object.values(LINES).flatMap((v) => (Array.isArray(v) ? v : [v])), ...allFaqAnswers()];
  const texts = lines.map((l) => l.hi).filter((s) => s && !s.includes("{"));
  return [...new Set(texts.flatMap((s) => splitSentences(toSpoken(s, "hi"))))];
}

let warming: Promise<void> | null = null;
/** Loads the model, then records Sakhi's fixed Hindi sentences into the cache one at a time. */
export function warmHindiVoice() {
  if (!hindiVoiceAvailable() || warming) return;
  warming = (async () => {
    await voice.load();
    for (const sentence of fixedSentences()) await synthesizeHindi(sentence);
  })().catch(() => {
    warming = null;
  });
}
