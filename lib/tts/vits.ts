// The engine behind Sakhi's server voices: SYSPIN's open female VITS models
// (IISc Bangalore, CC BY 4.0), exported to ONNX by scripts/kannada-voice/export.py
// and run with onnxruntime-node. Each language module (kannada.ts, hindi.ts)
// prepares its own text; this file turns prepared text into speech: letters
// to model ids, chunks the model can take, one synthesis at a time across
// all voices, 22.05 kHz WAV, cached in memory and on disk.
import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InferenceSession } from "onnxruntime-node";

export const SAMPLE_RATE = 22050;
/** The traced models read at most 235 tokens (117 letters, with blanks between); chunks stay under that. */
export const MAX_CHARS = 110;
const PUNCTUATION = "!¡'(),-.:;¿? ";

interface Loaded {
  run: (ids: number[]) => Promise<Float32Array>;
  ids: Map<string, number>;
  blank: number;
}

export interface VitsVoice {
  /** Whether the exported model is on disk. */
  available(): boolean;
  /** Loads the model (once). */
  load(): Promise<void>;
  /** Speaks text already prepared for this voice (its letters only); returns a WAV. */
  speak(prepared: string): Promise<Buffer>;
}

/** Splits into pieces of at most `max` characters, at sentence ends, then commas, then spaces. */
export function chunkText(text: string, max = MAX_CHARS): string[] {
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

// One synthesis at a time across every voice: each run already uses every core it was given.
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
  if (memory.size > 300) memory.delete(memory.keys().next().value!);
}

/**
 * A voice backed by `dir` (model.onnx + chars.txt; WAVs are cached in dir/cache).
 */
export function vitsVoice(dir: string): VitsVoice {
  const model = path.join(dir, "model.onnx");
  const chars = path.join(dir, "chars.txt");
  const cache = path.join(dir, "cache");
  let loading: Promise<Loaded> | null = null;

  const load = () => {
    loading ??= (async () => {
      const ort = await import("onnxruntime-node");
      const letters = fs.readFileSync(chars, "utf8").replace(/^\n+|\n+$/g, "");
      // Same order as Coqui's VitsCharacters; a character listed twice keeps its last id.
      const vocab = ["<PAD>", ...Array.from(PUNCTUATION), ...Array.from(letters), "<BLNK>"];
      const ids = new Map<string, number>();
      vocab.forEach((c, i) => ids.set(c, i));
      const session: InferenceSession = await ort.InferenceSession.create(model, {
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
  };

  /** Letter ids with the blank token between and around them, as VITS was trained. */
  const tokens = (voice: Loaded, text: string) => {
    const seq = Array.from(text, (c) => voice.ids.get(c)).filter((id): id is number => id !== undefined);
    if (!seq.length) return [];
    const out = new Array<number>(seq.length * 2 + 1).fill(voice.blank);
    seq.forEach((id, i) => (out[i * 2 + 1] = id));
    return out;
  };

  return {
    available: () => fs.existsSync(model) && fs.existsSync(chars),
    load: async () => void (await load()),
    async speak(prepared: string) {
      // Files are per voice folder; the in-memory cache is shared, so its key names the voice too.
      const name = createHash("sha1").update(prepared).digest("hex");
      const key = `${dir}:${name}`;
      const hit = memory.get(key);
      if (hit) return hit;
      const file = path.join(cache, `${name}.wav`);
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
      for (const piece of chunkText(prepared)) {
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
        .mkdir(cache, { recursive: true })
        .then(() => fs.promises.writeFile(file, wav))
        .catch(() => undefined);
      return wav;
    },
  };
}
