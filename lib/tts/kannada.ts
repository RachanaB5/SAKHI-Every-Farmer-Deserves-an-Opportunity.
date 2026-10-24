// Sakhi's Kannada voice, spoken on the server: SYSPIN's open Kannada female
// VITS model (IISc Bangalore, CC BY 4.0), exported to ONNX by
// scripts/kannada-voice/export.py and run with onnxruntime-node. Browsers
// rarely have a Kannada voice (desktop Chrome has none), so without this
// Kannada would be read by a Hindi voice. Text is turned into Kannada
// letters (English words and numbers too), cut into chunks the model can
// take, synthesised one request at a time and cached as WAV.
import "server-only";
import path from "node:path";
import { allFaqAnswers } from "@/lib/assistant/faq";
import { kannadaNumbersToWords } from "@/lib/assistant/kannada-speech";
import { LINES, SCRIPT, type L3 } from "@/lib/assistant/signup-script";
import { splitSentences, toSpoken } from "@/lib/assistant/speech-text";
import { latinToKannada } from "./latin-kannada";
import { MAX_CHARS, chunkText, vitsVoice } from "./vits";

export { SAMPLE_RATE } from "./vits";

const DIR = process.env.KANNADA_VOICE_DIR?.trim() || path.join(process.cwd(), "models", "kn-female");
const voice = vitsVoice(DIR);

/** Whether the exported model is on disk. */
export function kannadaVoiceAvailable() {
  return voice.available();
}

/** Text as the model needs it: Kannada letters only, numbers as words. */
export function prepareKannada(text: string): string {
  return kannadaNumbersToWords(latinToKannada(text.normalize("NFC")))
    .toLowerCase()
    .replace(/;/g, ",")
    .replace(/-/g, " ")
    .replace(/:/g, ",")
    .replace(/[<>()[\]"]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits into pieces of at most `max` characters, at sentence ends, then commas, then spaces. */
export function chunkKannada(text: string, max = MAX_CHARS): string[] {
  return chunkText(text, max);
}

/**
 * Speaks `text` in Kannada.
 * @returns a 22.05 kHz mono WAV
 */
export function synthesizeKannada(text: string): Promise<Buffer> {
  return voice.speak(prepareKannada(text));
}

/** Sakhi's fixed Kannada sentences (sign-up questions, prompts, answers), split the way the browser sends them. */
function fixedSentences(): string[] {
  const lines: L3[] = [...SCRIPT.flat().map((q) => q.ask), ...Object.values(LINES).flatMap((v) => (Array.isArray(v) ? v : [v])), ...allFaqAnswers()];
  const texts = lines.map((l) => l.kn).filter((s) => s && !s.includes("{"));
  return [...new Set(texts.flatMap((s) => splitSentences(toSpoken(s, "kn"))))];
}

let warming: Promise<void> | null = null;
/**
 * Loads the model ahead of the first sentence, then records Sakhi's fixed
 * sentences into the cache one at a time (a request from a farmer waits
 * for at most one of them), so they play without delay.
 */
export function warmKannadaVoice() {
  if (!kannadaVoiceAvailable() || warming) return;
  warming = (async () => {
    await voice.load();
    for (const sentence of fixedSentences()) await synthesizeKannada(sentence);
  })().catch(() => {
    warming = null;
  });
}
