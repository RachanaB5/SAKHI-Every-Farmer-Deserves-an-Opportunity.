// Shapes reply text for the voice. The screen shows "₹2,500 · 50 kg ·
// FF-7K2QA"; a voice reading that literally stumbles ("rupee symbol two
// comma five hundred", "kay gee"). Here amounts become "2500 rupees", units
// become the spoken word ("kilos", "ಕಿಲೋ"), order codes are spelled out and
// symbols that cause odd pauses are dropped. Long replies are split into
// sentences so each one gets a natural fall and pause.
import type { AssistantLang } from "./intents";
import { kannadaNumbersToWords } from "./kannada-speech";

const RUPEES: Record<AssistantLang, [one: string, many: string]> = { en: ["rupee", "rupees"], hi: ["रुपया", "रुपये"], kn: ["ರೂಪಾಯಿ", "ರೂಪಾಯಿ"] };
const ABOUT: Record<AssistantLang, string> = { en: "about", hi: "लगभग", kn: "ಸುಮಾರು" };
const TO: Record<AssistantLang, string> = { en: "to", hi: "से", kn: "ರಿಂದ" };
const KM: Record<AssistantLang, string> = { en: "kilometres", hi: "किलोमीटर", kn: "ಕಿಲೋಮೀಟರ್" };
const rupees = (lang: AssistantLang, n: string) => `${n} ${RUPEES[lang][n === "1" ? 0 : 1]}`;

/** Display text → text that sounds natural when read aloud in `lang`. */
export function toSpoken(text: string, lang: AssistantLang): string {
  let s = text.normalize("NFC");
  // Indian digit grouping (1,25,000) is read as separate numbers.
  s = s.replace(/(\d),(?=\d)/g, "$1");
  // Order codes and OTP are spelled out letter by letter.
  s = s.replace(/\b([A-Z]{2})-([A-Z0-9]{4,8})\b/g, (_, a: string, b: string) => `${a}${b}`.split("").join(" "));
  s = s.replace(/\bOTP\b/g, "O T P");
  s = s.replace(/~\s?₹/g, `${ABOUT[lang]} ₹`);
  // ₹25/kg → "25 rupees per kg" (the unit is spoken below).
  s = s.replace(/₹\s?(\d+(?:\.\d+)?)\s?\/\s?([^\s.,;:!?।]+)/g, (_, n: string, u: string) =>
    lang === "en" ? `${rupees(lang, n)} per ${u}` : lang === "hi" ? `${rupees(lang, n)} प्रति ${u}` : `${u}ಗೆ ${rupees(lang, n)}`,
  );
  s = s.replace(/₹\s?(\d+(?:\.\d+)?)/g, (_, n: string) => rupees(lang, n));
  if (lang === "en") {
    s = s.replace(/\bper kg\b/gi, "per kilo").replace(/\b(\d+(?:\.\d+)?)\s?kg\b/g, (_, n: string) => `${n} ${n === "1" ? "kilo" : "kilos"}`).replace(/\bkgs?\b/g, "kilos");
  } else if (lang === "hi") {
    s = s.replace(/(^|\s)kg(?=\s|$|[.,।])/g, "$1किलो").replace(/किग्रा/g, "किलो");
  } else {
    s = s.replace(/ಕೆಜಿ/g, "ಕಿಲೋ").replace(/(^|\s)kg(?=\s|$|[.,])/g, "$1ಕಿಲೋ");
  }
  // "25–100" is a range, "10 km" is kilometres.
  s = s.replace(/(\d)\s?–\s?(\d)/g, `$1 ${TO[lang]} $2`).replace(/(\d)\s?km\b/g, `$1 ${KM[lang]}`);
  // Symbols a voice reads aloud or pauses on awkwardly.
  s = s
    .replace(/\s\/\s/g, ", ")
    .replace(/[“”"«»()]/g, "")
    .replace(/\s*·\s*/g, ", ")
    .replace(/…/g, ".")
    .replace(/\s*[:;]\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  // Numbers the way people here say them: lakhs in English, Kannada words in Kannada.
  if (lang === "en") s = s.replace(/\b\d{6,9}\b/g, (m) => indianEnglish(Number(m)));
  if (lang === "kn") s = kannadaNumbersToWords(s);
  return s;
}

/** 125000 → "1 lakh 25000", 12500000 → "1 crore 25 lakh" (English voices say "one lakh twenty five thousand"). */
function indianEnglish(n: number): string {
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const rest = n % 100_000;
  return [crore && `${crore} crore`, lakh && `${lakh} lakh`, rest && String(rest)].filter(Boolean).join(" ");
}

/**
 * Splits spoken text into sentences, folding very short ones ("Okay.",
 * "ಸರಿ.") into the next so the voice doesn't stop and start.
 */
export function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?।])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const prev = out.at(-1);
    if (prev !== undefined && prev.split(/\s+/).length < 3) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out;
}
