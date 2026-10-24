// Kannada for the voice. Two jobs:
//  1. Numbers as Kannada words ("2500" → "ಎರಡು ಸಾವಿರದ ಐನೂರು"), so they are
//     never read in another language.
//  2. When a device has no Kannada voice (desktop Chrome has none), Kannada
//     text is rewritten letter for letter in Devanagari so a Hindi voice can
//     read the Kannada words. Both scripts share the same Unicode layout
//     (ಕ U+0C95 ↔ क U+0915), so this is a fixed offset plus a few fixes for
//     the short e / o that Hindi doesn't have.

const ONES = "ಸೊನ್ನೆ ಒಂದು ಎರಡು ಮೂರು ನಾಲ್ಕು ಐದು ಆರು ಏಳು ಎಂಟು ಒಂಬತ್ತು ಹತ್ತು ಹನ್ನೊಂದು ಹನ್ನೆರಡು ಹದಿಮೂರು ಹದಿನಾಲ್ಕು ಹದಿನೈದು ಹದಿನಾರು ಹದಿನೇಳು ಹದಿನೆಂಟು ಹತ್ತೊಂಬತ್ತು".split(" ");
const TENS = ["", "", "ಇಪ್ಪತ್ತು", "ಮೂವತ್ತು", "ನಲವತ್ತು", "ಐವತ್ತು", "ಅರವತ್ತು", "ಎಪ್ಪತ್ತು", "ಎಂಬತ್ತು", "ತೊಂಬತ್ತು"];
/** 1–9 joined to a tens stem: ಇಪ್ಪತ್ತ + ೈದು = ಇಪ್ಪತ್ತೈದು. */
const UNIT_SUFFIX = ["", "ೊಂದು", "ೆರಡು", "ಮೂರು", "ನಾಲ್ಕು", "ೈದು", "ಾರು", "ೇಳು", "ೆಂಟು", "ೊಂಬತ್ತು"];
const HUNDREDS = ["", "ನೂರು", "ಇನ್ನೂರು", "ಮುನ್ನೂರು", "ನಾನೂರು", "ಐನೂರು", "ಆರುನೂರು", "ಏಳುನೂರು", "ಎಂಟುನೂರು", "ಒಂಬೈನೂರು"];
/** Drops the final ು so a word can join what follows (ನೂರು → ನೂರ ಐವತ್ತು). */
const joining = (w: string) => (w.endsWith("ು") ? w.slice(0, -1) : w);

function below100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? joining(TENS[t]) + UNIT_SUFFIX[u] : TENS[t];
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (!h) return below100(rest);
  return rest ? `${joining(HUNDREDS[h])} ${below100(rest)}` : HUNDREDS[h];
}

/** A whole number in Kannada words, Indian style (ಸಾವಿರ, ಲಕ್ಷ, ಕೋಟಿ). */
export function kannadaNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n < 1000) return below1000(n);
  const parts: [number, string, string][] = [
    [10_000_000, "ಕೋಟಿ", "ಕೋಟಿಯ"],
    [100_000, "ಲಕ್ಷ", "ಲಕ್ಷದ"],
    [1000, "ಸಾವಿರ", "ಸಾವಿರದ"],
  ];
  for (const [size, word, linking] of parts) {
    if (n < size) continue;
    const head = Math.floor(n / size);
    const rest = n % size;
    const lead = head === 1 && size === 1000 ? "" : `${kannadaNumber(head)} `;
    return rest ? `${lead}${linking} ${kannadaNumber(rest)}` : `${lead}${word}`;
  }
  return below1000(n);
}

/** Every number in `text` as Kannada words ("2.5" → "ಎರಡು ಪಾಯಿಂಟ್ ಐದು"). */
export function kannadaNumbersToWords(text: string): string {
  return text.replace(/\d+(?:\.\d+)?/g, (m) => {
    const [whole, frac] = m.split(".");
    const words = kannadaNumber(Number(whole));
    return frac ? `${words} ಪಾಯಿಂಟ್ ${frac.split("").map((d) => ONES[Number(d)]).join(" ")}` : words;
  });
}

const KN_START = 0x0c80;
const KN_END = 0x0cff;
const OFFSET = 0x0c80 - 0x0900;
/** Short e / o (and their signs) → the long ones a Hindi voice knows; length marks dropped. */
const FIX: Record<string, string> = { "ಎ": "ए", "ಒ": "ओ", "ೆ": "े", "ೊ": "ो", "ೕ": "", "ೖ": "" };

/**
 * Hindi voices drop a word's last "a" (रैत is read "rait"), but Kannada says
 * it (ರೈತ is "raita"), so a word ending in a bare consonant gets it written out.
 */
const FINAL_A = /([क-हक़-य़])(?=$|[^ऀ-ॿ])/g;

/** Kannada letters rewritten in Devanagari, letter for letter, with each word's final "a" kept; everything else is kept. */
export function kannadaToDevanagari(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code < KN_START || code > KN_END) out += ch;
    else out += FIX[ch] ?? String.fromCodePoint(code - OFFSET);
  }
  return out.replace(FINAL_A, "$1ा");
}

/** Kannada text ready for a Hindi voice: numbers as Kannada words, then Devanagari letters. */
export const kannadaForHindiVoice = (text: string) => kannadaToDevanagari(kannadaNumbersToWords(text));
