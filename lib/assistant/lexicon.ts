// Multilingual vocabulary for Sakhi: crop names (English,
// Hindi Devanagari + romanised, Kannada script + romanised) mapped to the
// canonical crop slugs in lib/crops.ts, plus units, currency, "per kilo"
// markers, dates and earnings periods.
import { CROPS, CROP_SLUGS, type CropSlug } from "@/lib/crops";

/** Extra spoken variants on top of the catalogue aliases. */
const EXTRA_CROP_TERMS: Record<CropSlug, string[]> = {
  tomato: ["tomato hannu", "ಟೊಮೇಟೊ ಹಣ್ಣು", "tomaato", "tamaatar", "tamatar", "tamatur", "ಟೊಮಾಟೊ", "ಟೊಮೊಟೊ", "टमाटरों", "टोमेटो"],
  onion: ["eerulli", "irulli", "ಈರುಳ್ಳಿ", "ಉಳ್ಳಾಗಡ್ಡೆ", "ullagadde", "pyaaz", "pyaz", "प्याज़", "प्याज", "kanda", "ಆನಿಯನ್"],
  potato: ["aalugadde", "aloogadde", "alugadde", "ಆಲೂಗಡ್ಡೆ", "ಬಟಾಟೆ", "batate", "aaloo", "aloo", "आलू", "batata"],
  spinach: ["palak", "palak soppu", "paalak", "ಪಾಲಕ್", "ಪಾಲಕ್ ಸೊಪ್ಪು", "ಪಾಲಕ", "पालक"],
  carrot: ["gajjari", "ಗಜ್ಜರಿ", "gajar", "गाजर", "ಕ್ಯಾರೆಟ್", "carat"],
  beans: ["huruli", "hurulikai", "ಹುರುಳಿ", "ಹುರುಳಿಕಾಯಿ", "ಬೀನ್ಸ್", "बीन्स", "phali", "फली", "fansi"],
  brinjal: ["badane", "badanekai", "ಬದನೆ", "ಬದನೆಕಾಯಿ", "baingan", "baigan", "बैंगन", "vankaya"],
  cabbage: ["elekosu", "kosu", "ಎಲೆಕೋಸು", "ಕೋಸು", "patta gobhi", "band gobhi", "पत्ता गोभी", "पत्तागोभी", "gobhi", "गोभी"],
  milk: ["haalu", "halu", "ಹಾಲು", "doodh", "dudh", "दूध"],
  eggs: ["motte", "ಮೊಟ್ಟೆ", "ಮೊಟ್ಟೆಗಳು", "anda", "ande", "अंडा", "अंडे"],
  chicken: ["koli", "ಕೋಳಿ", "murga", "murgi", "मुर्गा", "मुर्गी", "चिकन"],
};

/** term → slug, longest terms first so "patta gobhi" beats "gobhi". */
export const CROP_TERMS: [string, CropSlug][] = CROP_SLUGS.flatMap((slug) =>
  [...new Set([slug, CROPS[slug].names.en.toLowerCase(), CROPS[slug].names.hi, CROPS[slug].names.kn, ...CROPS[slug].aliases, ...EXTRA_CROP_TERMS[slug]].map((t) => t.toLowerCase().normalize("NFC")))].map(
    (t) => [t, slug] as [string, CropSlug],
  ),
).sort((a, b) => b[0].length - a[0].length);

export type CanonicalUnit = "kg" | "quintal" | "dozen" | "litre" | "gram";

/** Spoken unit words → canonical unit. */
export const UNIT_TERMS: [string, CanonicalUnit][] = (
  [
    ["kg", ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "किलो", "किलोग्राम", "केजी", "ಕಿಲೋ", "ಕೆಜಿ", "ಕೇಜಿ", "ಕಿಲೊ", "ಕಿಲೋಗ್ರಾಂ", "keji"]],
    ["quintal", ["quintal", "quintals", "kuintal", "kwintal", "क्विंटल", "ಕ್ವಿಂಟಲ್"]],
    ["dozen", ["dozen", "dozens", "darjan", "दर्जन", "ಡಜನ್", "dajan"]],
    ["litre", ["litre", "liter", "litres", "liters", "ltr", "litar", "लीटर", "ಲೀಟರ್", "ಲೀಟರು"]],
    ["gram", ["gram", "grams", "gm", "ग्राम", "ಗ್ರಾಂ"]],
  ] as [CanonicalUnit, string[]][]
)
  .flatMap(([unit, words]) => words.map((w) => [w, unit] as [string, CanonicalUnit]))
  .sort((a, b) => b[0].length - a[0].length);

/** Kannada dative "per" forms: ಕಿಲೋಗೆ = per kilo. */
export const PER_UNIT_TERMS = ["ಕಿಲೋಗೆ", "ಕೆಜಿಗೆ", "ಕಿಲೊಗೆ", "ಲೀಟರ್‌ಗೆ", "ಲೀಟರಿಗೆ", "ಡಜನ್‌ಗೆ", "kilogge", "kiloge"];
/** Words that mark "per" before or after a unit. */
export const PER_WORDS = ["per", "a", "each", "prati", "प्रति", "ka", "ke", "ki", "का", "के", "की", "ge", "ಗೆ", "ಒಂದಕ್ಕೆ"];

export const CURRENCY_TERMS = ["₹", "rs", "rs.", "inr", "rupee", "rupees", "rupaye", "rupaiye", "rupaiya", "rupiya", "rupay", "rupai", "rupayi", "रुपये", "रुपए", "रुपया", "रूपये", "ರೂಪಾಯಿ", "ರೂ", "ರೂಪಾಯಿಗೆ", "ರೂಪಾಯಿಯಂತೆ", "bucks"];

export const DATE_TERMS: [string, number][] = [
  ["today", 0], ["aaj", 0], ["aj", 0], ["आज", 0], ["ಇಂದು", 0], ["ಇವತ್ತು", 0], ["indu", 0], ["ivattu", 0],
  ["yesterday", 1], ["kal", 1], ["कल", 1], ["ನಿನ್ನೆ", 1], ["ninne", 1],
  ["parso", 2], ["परसों", 2], ["ಮೊನ್ನೆ", 2], ["monne", 2],
];

export type Period = "today" | "week" | "month" | "all";
export const PERIOD_TERMS: [string, Period][] = [
  ["today", "today"], ["aaj", "today"], ["आज", "today"], ["ಇಂದು", "today"], ["ಇವತ್ತು", "today"],
  ["this week", "week"], ["week", "week"], ["hafte", "week"], ["hafta", "week"], ["हफ्ते", "week"], ["हफ़्ते", "week"], ["हफ्ता", "week"], ["सप्ताह", "week"], ["ವಾರ", "week"], ["vaara", "week"], ["vara", "week"],
  ["this month", "month"], ["month", "month"], ["mahine", "month"], ["mahina", "month"], ["महीने", "month"], ["महीना", "month"], ["ತಿಂಗಳು", "month"], ["ತಿಂಗಳ", "month"], ["tingalu", "month"],
  ["total", "all"], ["overall", "all"], ["so far", "all"], ["all time", "all"], ["kul", "all"], ["कुल", "all"], ["ab tak", "all"], ["अब तक", "all"], ["ಒಟ್ಟು", "all"], ["ottu", "all"], ["ಇಲ್ಲಿಯವರೆಗೆ", "all"],
];

/** Yes / no words used to answer a visible confirmation card by voice. */
export const YES_WORDS = ["yes", "yeah", "yep", "ok", "okay", "confirm", "sure", "haan", "ha", "haa", "ji haan", "theek hai", "thik hai", "हाँ", "हां", "जी", "ठीक है", "हो", "ಹೌದು", "howdu", "houdu", "sari", "ಸರಿ", "aagali", "ಆಗಲಿ"];
export const NO_WORDS = ["no", "nope", "cancel", "stop", "nahi", "nahin", "mat", "नहीं", "नही", "रद्द", "ಇಲ್ಲ", "illa", "beda", "ಬೇಡ", "ರದ್ದು"];

/** Answer to a yes/no question, or null when the reply is something else. */
export function yesNo(text: string): "yes" | "no" | null {
  const t = text.toLowerCase().normalize("NFC").replace(/[.!?,।]/g, "").trim();
  if (!t) return null;
  if (NO_WORDS.some((w) => t === w || t.startsWith(`${w} `))) return "no";
  if (YES_WORDS.some((w) => t === w || t.startsWith(`${w} `) || t.endsWith(` ${w}`))) return "yes";
  return null;
}
