// Sakhi's Kannada voice, spoken on the server: SYSPIN's open Kannada female
// VITS model (IISc Bangalore, CC BY 4.0), exported to ONNX by
// scripts/kannada-voice/export.py and run with onnxruntime-node. Browsers
// rarely have a Kannada voice (desktop Chrome has none), so without this
// Kannada would be read by a Hindi voice. Text is turned into Kannada
// letters (English words and numbers too), cut into chunks the model can
// take, synthesised one request at a time and cached as WAV.
import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InferenceSession } from "onnxruntime-node";
import { allFaqAnswers } from "@/lib/assistant/faq";
import { kannadaNumbersToWords } from "@/lib/assistant/kannada-speech";
import { LINES, SCRIPT, type L3 } from "@/lib/assistant/signup-script";
import { splitSentences, toSpoken } from "@/lib/assistant/speech-text";
import { latinToKannada } from "./latin-kannada";

const DIR = process.env.KANNADA_VOICE_DIR?.trim() || path.join(process.cwd(), "models", "kn-female");
const MODEL = path.join(DIR, "model.onnx");
const CHARS = path.join(DIR, "chars.txt");
const CACHE = path.join(DIR, "cache");
export const SAMPLE_RATE = 22050;
/** The traced model reads at most 235 tokens (117 letters, with blanks between); chunks stay under that. */
const MAX_CHARS = 110;
const PUNCTUATION = "!¡'(),-.:;¿? ";

interface Voice {
  run: (ids: number[]) => Promise<Float32Array>;
  ids: Map<string, number>;
  blank: number;
}

/** Whether the exported model is on disk. */
export function kannadaVoiceAvailable() {
  return fs.existsSync(MODEL) && fs.existsSync(CHARS);
}

let loading: Promise<Voice> | null = null;
function load(): Promise<Voice> {
  loading ??= (async () => {
    const ort = await import("onnxruntime-node");
    const letters = fs.readFileSync(CHARS, "utf8").replace(/^\n+|\n+$/g, "");
    // Same order as Coqui's VitsCharacters; a character listed twice keeps its last id.
    const vocab = ["<PAD>", ...Array.from(PUNCTUATION), ...Array.from(letters), "<BLNK>"];
    const ids = new Map<string, number>();
    vocab.forEach((c, i) => ids.set(c, i));
    const session: InferenceSession = await ort.InferenceSession.create(MODEL, {
      intraOpNumThreads: Math.max(1, Math.min(8, os.availableParallelism())),
      graphOptimizationLevel: "all",
    });
    const run = async (tokens: number[]) => {
      const input = new ort.Tensor("int64", BigInt64Array.from(tokens, (t) => BigInt(t)), [1, tokens.length]);
      const out = await session.run({ input });
      return out.audio.data as Float32Array;
    };
    return { run, ids, blank: ids.get("<BLNK>")! };
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
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
  const out: string[] = [];
  const push = (piece: string, seps: RegExp[]) => {
    piece = piece.trim();
    if (!piece) return;
    if (piece.length <= max) return void out.push(piece);
    const [sep, ...rest] = seps;
    if (!sep) {
      for (let i = 0; i < piece.length; i += max) out.push(piece.slice(i, i + max));
      return;
    }
    let current = "";
    for (const part of piece.split(sep)) {
      if (current && (current + part).length > max) {
        push(current, rest);
        current = "";
      }
      current += part;
    }
    push(current, rest);
  };
  push(text, [/(?<=[.!?।])\s+/, /(?<=,)\s*/, /(?<=\s)/]);
  return out;
}

/** Letter ids with the blank token between and around them, as VITS was trained. */
function tokens(voice: Voice, text: string): number[] {
  const seq = Array.from(text, (c) => voice.ids.get(c)).filter((id): id is number => id !== undefined);
  if (!seq.length) return [];
  const out = new Array<number>(seq.length * 2 + 1).fill(voice.blank);
  seq.forEach((id, i) => (out[i * 2 + 1] = id));
  return out;
}

// One synthesis at a time: each run already uses every core it was given.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

function toWav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}

const memory = new Map<string, Buffer>();
function remember(key: string, wav: Buffer) {
  memory.delete(key);
  memory.set(key, wav);
  if (memory.size > 200) memory.delete(memory.keys().next().value!);
}

/**
 * Speaks `text` in Kannada.
 * @returns a 22.05 kHz mono WAV
 */
export async function synthesizeKannada(text: string): Promise<Buffer> {
  const prepared = prepareKannada(text);
  const key = createHash("sha1").update(prepared).digest("hex");
  const hit = memory.get(key);
  if (hit) return hit;
  const file = path.join(CACHE, `${key}.wav`);
  try {
    const wav = await fs.promises.readFile(file);
    remember(key, wav);
    return wav;
  } catch {
    /* not cached yet */
  }

  const voice = await load();
  const gap = new Float32Array(Math.round(SAMPLE_RATE * 0.14));
  const parts: Float32Array[] = [];
  for (const piece of chunkKannada(prepared)) {
    const ids = tokens(voice, piece);
    if (!ids.length) continue;
    if (parts.length) parts.push(gap);
    parts.push(await serial(() => voice.run(ids)));
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  const wav = toWav(all);
  remember(key, wav);
  fs.promises
    .mkdir(CACHE, { recursive: true })
    .then(() => fs.promises.writeFile(file, wav))
    .catch(() => undefined);
  return wav;
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
    await load();
    for (const sentence of fixedSentences()) await synthesizeKannada(sentence);
  })().catch(() => {
    warming = null;
  });
}
