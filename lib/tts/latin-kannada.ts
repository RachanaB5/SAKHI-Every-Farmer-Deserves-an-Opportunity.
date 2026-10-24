// Kannada lines often carry English words in Latin letters: names
// ("ನಮಸ್ಕಾರ Ramesh"), the brand ("FoodFlow"), letters of an order code. The
// Kannada voice model only knows Kannada letters, so those words are
// rewritten in Kannada script first: known words from a small dictionary,
// single capitals as their letter names, anything else by sound.

const WORDS: Record<string, string> = {
  foodflow: "ಫುಡ್ ಫ್ಲೋ",
  sakhi: "ಸಖಿ",
  razorpay: "ರೇಜರ್ ಪೇ",
  google: "ಗೂಗಲ್",
  microsoft: "ಮೈಕ್ರೋಸಾಫ್ಟ್",
  edge: "ಎಡ್ಜ್",
  chrome: "ಕ್ರೋಮ್",
  whatsapp: "ವಾಟ್ಸಾಪ್",
  app: "ಆಪ್",
  online: "ಆನ್‌ಲೈನ್",
  offline: "ಆಫ್‌ಲೈನ್",
  ok: "ಓಕೆ",
  okay: "ಓಕೆ",
  otp: "ಓಟಿಪಿ",
  upi: "ಯುಪಿಐ",
  qr: "ಕ್ಯೂಆರ್",
  pin: "ಪಿನ್",
  id: "ಐಡಿ",
  kg: "ಕಿಲೋ",
  km: "ಕಿಲೋಮೀಟರ್",
  gowda: "ಗೌಡ",
  reddy: "ರೆಡ್ಡಿ",
  rao: "ರಾವ್",
  bengaluru: "ಬೆಂಗಳೂರು",
  bangalore: "ಬೆಂಗಳೂರು",
  hebbal: "ಹೆಬ್ಬಾಳ",
  yelahanka: "ಯಲಹಂಕ",
  doddaballapur: "ದೊಡ್ಡಬಳ್ಳಾಪುರ",
  whitefield: "ವೈಟ್‌ಫೀಲ್ಡ್",
  tomato: "ಟೊಮೇಟೊ",
  onion: "ಈರುಳ್ಳಿ",
  potato: "ಆಲೂಗಡ್ಡೆ",
  email: "ಇಮೇಲ್",
  photo: "ಫೋಟೋ",
  video: "ವಿಡಿಯೋ",
  delivery: "ಡೆಲಿವರಿ",
  order: "ಆರ್ಡರ್",
  orders: "ಆರ್ಡರ್‌ಗಳು",
};

const LETTERS: Record<string, string> = {
  A: "ಎ", B: "ಬಿ", C: "ಸಿ", D: "ಡಿ", E: "ಈ", F: "ಎಫ್", G: "ಜಿ", H: "ಎಚ್", I: "ಐ", J: "ಜೆ", K: "ಕೆ", L: "ಎಲ್", M: "ಎಮ್",
  N: "ಎನ್", O: "ಓ", P: "ಪಿ", Q: "ಕ್ಯೂ", R: "ಆರ್", S: "ಎಸ್", T: "ಟಿ", U: "ಯು", V: "ವಿ", W: "ಡಬ್ಲ್ಯೂ", X: "ಎಕ್ಸ್", Y: "ವೈ", Z: "ಜೆಡ್",
};

const CONSONANTS: [string, string][] = [
  ["ksh", "ಕ್ಷ"], ["chh", "ಛ"], ["sh", "ಶ"], ["ch", "ಚ"], ["th", "ತ"], ["dh", "ಧ"], ["kh", "ಖ"], ["gh", "ಘ"], ["bh", "ಭ"], ["ph", "ಫ"], ["jh", "ಝ"],
  ["k", "ಕ"], ["g", "ಗ"], ["j", "ಜ"], ["t", "ತ"], ["d", "ದ"], ["n", "ನ"], ["p", "ಪ"], ["b", "ಬ"], ["m", "ಮ"], ["y", "ಯ"], ["r", "ರ"], ["l", "ಲ"],
  ["v", "ವ"], ["w", "ವ"], ["s", "ಸ"], ["h", "ಹ"], ["f", "ಫ"], ["z", "ಜ"], ["q", "ಕ"], ["x", "ಕ್ಸ"], ["c", "ಕ"],
];
// [spelling, independent vowel, vowel sign]
const VOWELS: [string, string, string][] = [
  ["aa", "ಆ", "ಾ"], ["ai", "ಐ", "ೈ"], ["au", "ಔ", "ೌ"], ["ee", "ಈ", "ೀ"], ["ii", "ಈ", "ೀ"], ["oo", "ಊ", "ೂ"], ["uu", "ಊ", "ೂ"],
  ["a", "ಅ", ""], ["e", "ಎ", "ೆ"], ["i", "ಇ", "ಿ"], ["o", "ಒ", "ೊ"], ["u", "ಉ", "ು"],
];
const VIRAMA = "್";

/** A Latin word written by sound in Kannada letters ("ramesh" → "ರಮೇಶ್"). */
export function soundOut(word: string): string {
  const w = word.toLowerCase();
  let out = "";
  let pending = false; // a consonant waiting for its vowel
  let i = 0;
  while (i < w.length) {
    const v = VOWELS.find(([s]) => w.startsWith(s, i));
    if (v) {
      let [, independent, sign] = v;
      // A lone e or o before one final consonant is long: Ramesh, Mahesh, Ashok.
      const rest = w.slice(i + v[0].length);
      if ((v[0] === "e" || v[0] === "o") && CONSONANTS.some(([s]) => rest === s)) {
        independent = v[0] === "e" ? "ಏ" : "ಓ";
        sign = v[0] === "e" ? "ೇ" : "ೋ";
      }
      out += pending ? sign : independent;
      pending = false;
      i += v[0].length;
      continue;
    }
    const c = CONSONANTS.find(([s]) => w.startsWith(s, i));
    if (!c) {
      i += 1;
      continue;
    }
    // n before a stop is a nasal: Anand → ಅನಂದ್, Venkat → ವೆಂಕತ್ (but Ananya keeps ನ್ಯ).
    if (c[0] === "n" && !pending && out && /^[kgcjtdpb]/.test(w.slice(i + 1))) {
      out += "ಂ";
      i += 1;
      continue;
    }
    if (pending) out += VIRAMA;
    out += c[1];
    pending = true;
    i += c[0].length;
  }
  if (pending) out += VIRAMA;
  return out;
}

/** Rewrites every Latin-letter word in `text` in Kannada letters. */
export function latinToKannada(text: string): string {
  if (!/[A-Za-z]/.test(text)) return text;
  return text.replace(/[A-Za-z]+/g, (word) => {
    const known = WORDS[word.toLowerCase()];
    if (known) return known;
    // Spelled-out codes arrive as single capitals ("F F 7 K 2 Q A").
    if (word.length === 1 && /[A-Z]/.test(word)) return LETTERS[word];
    // Short all-caps words are acronyms: read their letters.
    if (word.length <= 4 && word === word.toUpperCase()) return word.split("").map((ch) => LETTERS[ch] ?? "").join("");
    return soundOut(word);
  });
}
