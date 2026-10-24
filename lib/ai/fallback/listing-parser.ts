// Offline parser for spoken harvest descriptions, e.g.
//   "50 kilo tamatar, aaj tode, 25 rupaye kilo"
//   "50 किलो टमाटर आज तोड़े 25 रुपये किलो"
//   "ಐವತ್ತು ಕೆಜಿ ಟೊಮೇಟೊ ಇವತ್ತು ಕೊಯ್ಲು ಕೆಜಿಗೆ 25 ರೂಪಾಯಿ"
// Used when no model is configured or the model call fails. Anything it
// can't find is reported in `missing` — it never guesses.
import { CROPS, matchCrop } from "@/lib/crops";
import type { ParsedListing } from "../schemas";
import { normaliseNumbers } from "./numbers";

const UNIT_WORDS: { re: RegExp; unit: "kg" | "litre" | "dozen"; factor: number }[] = [
  { re: /(quintal|क्विंटल|ಕ್ವಿಂಟಾಲ್)/, unit: "kg", factor: 100 },
  { re: /(kgs?|kilos?|kilograms?|किलो|किग्रा|ಕೆಜಿ|ಕಿಲೋ|கிலோ|కిలో)/, unit: "kg", factor: 1 },
  { re: /(litres?|liters?|ltrs?|लीटर|ಲೀಟರ್|லிட்டர்|లీటర్)/, unit: "litre", factor: 1 },
  { re: /(dozens?|darjan|दर्जन|ಡಜನ್|டஜன்|డజను)/, unit: "dozen", factor: 1 },
];
const UNIT_ALT = UNIT_WORDS.map((u) => u.re.source.slice(1, -1)).join("|");

const RUPEE = "(?:₹|rs\\.?|inr|rupaye|rupaiya|rupees?|रुपये|रुपए|रुपया|रूपए|ರೂಪಾಯಿ|ರೂ|ரூபாய்|రూపాయలు|రూపాయి)";

const TODAY = /(aaj|आज|today|ಇವತ್ತು|ಇಂದು|இன்று|ఈరోజు|ఈ రోజు)/;
const YESTERDAY = /(\bkal\b|कल|yesterday|ನಿನ್ನೆ|நேற்று|నిన్న)/;
const DAY_BEFORE = /(parson|parso|परसों|ಮೊನ್ನೆ|முந்தாநாள்|మొన్న)/;
const DAYS_AGO = /(\d+)\s*(din|दिन|days?|ದಿನ)\s*(pehle|pahle|पहले|ago|ಹಿಂದೆ)/;

/** YYYY-MM-DD in local time. */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Extracts listing fields from a transcript.
 * @param transcript - raw speech-to-text output
 * @param now - reference "today" (injectable for tests)
 */
export function parseListingFallback(transcript: string, now: Date = new Date()): ParsedListing {
  const text = normaliseNumbers(transcript);
  const crop = matchCrop(text);

  // Price first: a number attached to a rupee marker on either side.
  let price: number | null = null;
  const priceMatch =
    text.match(new RegExp(`${RUPEE}\\s*(\\d+(?:\\.\\d+)?)`)) ?? text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${RUPEE}`));
  if (priceMatch) price = Number(priceMatch[1]);

  // Quantity: first number followed by a unit word that isn't the price number.
  let qty: number | null = null;
  let unit: "kg" | "litre" | "dozen" | null = null;
  const qtyRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})`, "g");
  for (const m of text.matchAll(qtyRe)) {
    const n = Number(m[1]);
    if (priceMatch && m.index === priceMatch.index) continue;
    if (price !== null && n === price && qty !== null) continue;
    const u = UNIT_WORDS.find((w) => w.re.test(m[2]))!;
    qty = n * u.factor;
    unit = u.unit;
    break;
  }
  // "50 tamatar" (no unit word): take the first number that isn't the price.
  if (qty === null) {
    const nums = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    const candidate = nums.find((n) => n !== price);
    if (candidate !== undefined) qty = candidate;
  }
  if (qty !== null && unit === null && crop) unit = CROPS[crop].unit;

  let harvestDate: string | null = null;
  const daysAgo = text.match(DAYS_AGO);
  const day = new Date(now);
  if (daysAgo) {
    day.setDate(day.getDate() - Number(daysAgo[1]));
    harvestDate = isoDay(day);
  } else if (DAY_BEFORE.test(text)) {
    day.setDate(day.getDate() - 2);
    harvestDate = isoDay(day);
  } else if (YESTERDAY.test(text)) {
    day.setDate(day.getDate() - 1);
    harvestDate = isoDay(day);
  } else if (TODAY.test(text)) {
    harvestDate = isoDay(day);
  }

  const result = { crop, qty, unit, harvestDate, price };
  const missing = (Object.keys(result) as (keyof typeof result)[]).filter((k) => result[k] === null);
  return { ...result, missing };
}
