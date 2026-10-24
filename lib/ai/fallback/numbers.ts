// Normalises spoken/typed numbers across Indian scripts so the offline
// parsers can work on plain ASCII digits: native digits (०-९, ೦-೯, ௦-௯,
// ౦-౯) and common number words in Hindi, Kannada and English.

const DIGIT_BLOCKS = [0x0966 /* Devanagari */, 0x0ce6 /* Kannada */, 0x0be6 /* Tamil */, 0x0c66 /* Telugu */];

/** Maps native-script digits to ASCII. */
export function asciiDigits(text: string): string {
  return text.replace(/[०-९೦-೯௦-௯౦-౯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = DIGIT_BLOCKS.find((b) => code >= b && code <= b + 9)!;
    return String(code - base);
  });
}

// Longest words first so "pachees" is replaced before "pach…" style prefixes.
const WORDS: Record<string, number> = {
  // English
  hundred: 100, ninety: 90, eighty: 80, seventy: 70, sixty: 60, fifty: 50, "forty five": 45, forty: 40,
  "thirty five": 35, thirty: 30, "twenty five": 25, twenty: 20, fifteen: 15, twelve: 12, ten: 10,
  nine: 9, eight: 8, seven: 7, six: 6, five: 5, four: 4, three: 3, two: 2, one: 1, half: 0.5,
  // Hindi (Devanagari)
  "सौ": 100, "नब्बे": 90, "अस्सी": 80, "सत्तर": 70, "साठ": 60, "पचास": 50, "चालीस": 40, "पैंतीस": 35, "तीस": 30,
  "पच्चीस": 25, "बीस": 20, "पंद्रह": 15, "बारह": 12, "दस": 10, "नौ": 9, "आठ": 8, "सात": 7, "छह": 6,
  "पाँच": 5, "पांच": 5, "चार": 4, "तीन": 3, "दो": 2, "एक": 1, "आधा": 0.5,
  // Hindi (romanised)
  sau: 100, nabbe: 90, assi: 80, sattar: 70, saath: 60, pachas: 50, pachaas: 50, chalis: 40, chaalis: 40,
  paintis: 35, tees: 30, pachees: 25, pachchis: 25, bees: 20, pandrah: 15, barah: 12, das: 10,
  paanch: 5, panch: 5, teen: 3,
  // Kannada
  "ನೂರು": 100, "ತೊಂಬತ್ತು": 90, "ಎಂಬತ್ತು": 80, "ಎಪ್ಪತ್ತು": 70, "ಅರವತ್ತು": 60, "ಐವತ್ತು": 50, "ನಲವತ್ತು": 40,
  "ಮೂವತ್ತು": 30, "ಇಪ್ಪತ್ತೈದು": 25, "ಇಪ್ಪತ್ತು": 20, "ಹದಿನೈದು": 15, "ಹನ್ನೆರಡು": 12, "ಹತ್ತು": 10,
  "ಐದು": 5, "ನಾಲ್ಕು": 4, "ಮೂರು": 3, "ಎರಡು": 2, "ಒಂದು": 1, "ಅರ್ಧ": 0.5,
};
const WORD_KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length);

/** Escapes a literal for use inside a RegExp. */
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Converts native digits and number words to ASCII digits.
 * Latin words only match on word boundaries ("das" ≠ "dashboard");
 * Indic words match anywhere since \b doesn't understand those scripts.
 */
export function normaliseNumbers(text: string): string {
  let out = asciiDigits(text.toLowerCase());
  for (const word of WORD_KEYS) {
    const latin = /^[a-z ]+$/.test(word);
    const re = latin ? new RegExp(`\\b${escapeRe(word)}\\b`, "g") : new RegExp(escapeRe(word), "g");
    out = out.replace(re, ` ${WORDS[word]} `);
  }
  // Comma decimals (2,5 kg → 2.5 kg); collapse spaces but keep line breaks,
  // which separate items in grocery lists.
  return out
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}
