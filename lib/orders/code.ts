// Human-friendly order codes (e.g. FF-7K2Q) printed on packing labels and
// typed or spoken by delivery workers. Ambiguous glyphs (0/O, 1/I) excluded.
import { randomInt } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Generates a random order code; callers retry on the rare unique clash. */
export function newOrderCode(): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `FF-${s}`;
}

/** Normalises user input such as "ff 7k2qa" or "7K2QA" to "FF-7K2QA". */
export function normaliseOrderCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `FF-${raw.length === 7 && raw.startsWith("FF") ? raw.slice(2) : raw}`;
}
