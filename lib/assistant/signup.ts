// Understanding answers in the seller sign-up guide, in English, Hindi and
// Kannada: digits for a mobile number or PIN code ("nine eight double
// seven…", "ಒಂಬತ್ತು ಎಂಟು…"), names and places without the lead-in words
// ("my name is…", "ನನ್ನ ಹೆಸರು…"), the pilot villages in three scripts, every
// crop mentioned in one sentence, and the guide's voice commands.
import { asciiDigits } from "@/lib/ai/fallback/numbers";
import { SERVICE_AREAS, VILLAGES } from "@/lib/areas";
import { CROPS, type CropSlug } from "@/lib/crops";
import { fuzzyFind } from "./fuzzy";
import { CROP_TERMS } from "./lexicon";
import { normaliseSpokenNumbers } from "./numbers";

// ── Digits ─────────────────────────────────────────────────────────────
const DIGIT_WORDS: [number, string[]][] = [
  [0, ["zero", "oh", "shunya", "shoonya", "शून्य", "ज़ीरो", "जीरो", "sonne", "ಸೊನ್ನೆ", "ಶೂನ್ಯ", "ಜೀರೋ"]],
  [1, ["one", "ek", "एक", "ondu", "ಒಂದು"]],
  [2, ["two", "do", "दो", "eradu", "ಎರಡು"]],
  [3, ["three", "teen", "tin", "तीन", "mooru", "ಮೂರು"]],
  [4, ["four", "char", "chaar", "चार", "naalku", "nalku", "ನಾಲ್ಕು"]],
  [5, ["five", "paanch", "panch", "पाँच", "पांच", "aidu", "ಐದು"]],
  [6, ["six", "chhe", "che", "chah", "छह", "छः", "छे", "aaru", "ಆರು"]],
  [7, ["seven", "saat", "सात", "elu", "ಏಳು"]],
  [8, ["eight", "aath", "आठ", "entu", "ಎಂಟು"]],
  [9, ["nine", "nau", "नौ", "ombattu", "ಒಂಬತ್ತು"]],
];
const DIGIT = new Map(DIGIT_WORDS.flatMap(([d, words]) => words.map((w) => [w, String(d)] as const)));
const REPEAT = new Map([["double", 2], ["triple", 3], ["डबल", 2], ["ट्रिपल", 3], ["ಡಬಲ್", 2], ["ಟ್ರಿಪಲ್", 3]]);
const EN_TENS = new Map(["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"].map((w, i) => [w, (i + 2) * 10]));

/**
 * Every digit said in `text`, in order: numerals, digit words in three
 * languages, "double / triple", "ninety eight" and one-word Hindi or
 * Kannada numbers ("अट्ठानवे", "ತೊಂಬತ್ತೆಂಟು").
 */
export function spokenDigits(text: string): string {
  const toks = asciiDigits(text.toLowerCase().normalize("NFC"))
    .replace(/[^\p{L}\p{M}\d]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  let out = "";
  let times = 1;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const rep = REPEAT.get(t);
    if (rep) {
      times = rep;
      continue;
    }
    let d: string | null = null;
    if (/^\d+$/.test(t)) d = t;
    else if (DIGIT.has(t)) d = DIGIT.get(t)!;
    else if (EN_TENS.has(t)) {
      const unit = DIGIT.get(toks[i + 1] ?? "");
      if (unit && unit !== "0") {
        d = String(EN_TENS.get(t)! + Number(unit));
        i++;
      } else d = String(EN_TENS.get(t));
    } else {
      const n = normaliseSpokenNumbers(t);
      if (/^\d+$/.test(n)) d = n;
    }
    if (d === null) continue;
    out += d[0].repeat(times) + d.slice(1);
    times = 1;
  }
  return out;
}

/** A 10-digit Indian mobile number from spoken digits (drops a leading 91 or 0), or null. */
export function mobileFrom(digits: string): string | null {
  const d = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

// ── Names and places ───────────────────────────────────────────────────
export type AnswerKind = "name" | "farm" | "place" | "address";

const LEAD: Record<AnswerKind, RegExp[]> = {
  name: [
    /^(?:my name is|my name's|name is|i am|i'm|this is|it's|it is|call me)\s+/i,
    /^(?:mera naam|naam|main|mai)\s+/i,
    /^(?:मेरा नाम|नाम|मैं)\s+/,
    /^(?:nanna hesaru|hesaru|naanu)\s+/i,
    /^(?:ನನ್ನ ಹೆಸರು|ಹೆಸರು|ನಾನು)\s+/,
  ],
  farm: [
    /^(?:it'?s called|it is called|the farm is called|my farm is called|my farm is|farm name is|the name is|we call it|it'?s|it is)\s+/i,
    /^(?:मेरे (?:खेत|फ़ार्म|फार्म) का नाम|(?:खेत|फ़ार्म|फार्म) का नाम)\s+/,
    /^(?:ನನ್ನ (?:ತೋಟದ|ಫಾರ್ಮ್) ಹೆಸರು|(?:ತೋಟದ|ಫಾರ್ಮ್) ಹೆಸರು)\s+/,
  ],
  place: [
    /^(?:i'?m from|i am from|i live in|it'?s in|it is in|my village is|the village is|my district is|the district is|village|town|district|in|at|from|near)\s+/i,
    /^(?:मेरा गाँव|मेरा गांव|गाँव|गांव|ज़िला|जिला)\s+/,
    /^(?:ನಮ್ಮ ಊರು|ನನ್ನ ಊರು|ಊರು|ಜಿಲ್ಲೆ)\s+/,
  ],
  address: [/^(?:the address is|address is|it's at|it is at)\s+/i, /^(?:पता)\s+/, /^(?:ವಿಳಾಸ)\s+/],
};
const TRAIL: Record<AnswerKind, RegExp[]> = {
  name: [/\s+(?:है|हूँ|हूं)$/, /\s+(?:hai|hoon|hun|hu|anta)$/i, /\s*(?:ಅಂತ|ಎಂದು|ಆಗಿದೆ)$/],
  farm: [/\s+(?:है)$/, /\s+(?:hai|anta)$/i, /\s*(?:ಅಂತ|ಎಂದು|ಆಗಿದೆ)$/],
  place: [/\s+(?:district|village|town)$/i, /\s+(?:में|से|है|ज़िला|जिला|ज़िले में|जिले में)$/, /(?:ಯಲ್ಲಿ|ದಲ್ಲಿ|ನಲ್ಲಿ)$/, /\s*(?:ಜಿಲ್ಲೆ|ಊರು)$/],
  address: [],
};

const titleCase = (s: string) => s.replace(/\b([a-z])([a-z]*)\b/g, (_, a: string, b: string) => a.toUpperCase() + b);

/** The answer itself, without lead-in words or trailing particles ("ನನ್ನ ಹೆಸರು ರಮೇಶ್" → "ರಮೇಶ್"). */
export function cleanAnswer(text: string, kind: AnswerKind): string {
  let s = text.normalize("NFC").replace(/\s+/g, " ").replace(/[.,!?।]+$/g, "").trim();
  for (const re of LEAD[kind]) s = s.replace(re, "");
  for (let pass = 0; pass < 2; pass++) for (const re of TRAIL[kind]) s = s.replace(re, "").trim();
  s = s.replace(/[.,!?।]+$/g, "").trim();
  if (kind !== "address") s = titleCase(s);
  return s.slice(0, kind === "address" ? 160 : 80);
}

/** Pilot towns as people say and speech engines spell them. */
const PLACE_ALIASES: Record<string, string[]> = {
  Doddaballapur: ["ದೊಡ್ಡಬಳ್ಳಾಪುರ", "डोड्डाबल्लापुर", "doddaballapura", "dodballapur", "doddaballapur"],
  Devanahalli: ["ದೇವನಹಳ್ಳಿ", "देवनहल्ली", "devanahalli"],
  Rajanukunte: ["ರಾಜಾನುಕುಂಟೆ", "राजानुकुंटे", "rajanukunte"],
  Hoskote: ["ಹೊಸಕೋಟೆ", "होसकोटे", "hosakote", "hoskote"],
  Nelamangala: ["ನೆಲಮಂಗಲ", "नेलमंगला", "nelamangala"],
  Chikkajala: ["ಚಿಕ್ಕಜಾಲ", "चिक्कजाला", "chikkajala"],
  Kanakapura: ["ಕನಕಪುರ", "कनकपुरा", "कनकपुर", "kanakapura"],
  Anekal: ["ಆನೇಕಲ್", "अनेकल", "aanekal", "anekal"],
  Yelahanka: ["ಯಲಹಂಕ", "येलहंका", "yalahanka", "yelahanka"],
  Hebbal: ["ಹೆಬ್ಬಾಳ", "हेब्बाल", "hebbala", "hebbal"],
  Jayanagar: ["ಜಯನಗರ", "जयनगर", "jayanagara", "jayanagar"],
};

/** District and main PIN code of the pilot towns (Kanakapura's district is asked, not assumed). */
const PLACE_FACTS: Record<string, { district?: string; pin: string }> = {
  Doddaballapur: { district: "Bengaluru Rural", pin: "561203" },
  Devanahalli: { district: "Bengaluru Rural", pin: "562110" },
  Hoskote: { district: "Bengaluru Rural", pin: "562114" },
  Nelamangala: { district: "Bengaluru Rural", pin: "562123" },
  Rajanukunte: { district: "Bengaluru Urban", pin: "560064" },
  Chikkajala: { district: "Bengaluru Urban", pin: "562157" },
  Anekal: { district: "Bengaluru Urban", pin: "562106" },
  Kanakapura: { pin: "562117" },
  Yelahanka: { district: "Bengaluru Urban", pin: "560064" },
  Hebbal: { district: "Bengaluru Urban", pin: "560024" },
  Jayanagar: { district: "Bengaluru Urban", pin: "560011" },
};

/** A pilot town or village in any script, with its nearest FoodFlow service area, district and usual PIN code. */
export function matchVillage(text: string): { village: string; area: string; district?: string; pin?: string } | null {
  const flat = text.toLowerCase().normalize("NFC").replace(/[\s.,-]+/g, "");
  const places = [...VILLAGES.map((v) => ({ name: v.name, area: v.nearestArea })), ...SERVICE_AREAS.map((a) => ({ name: a.name, area: a.name }))];
  for (const p of places) {
    if ((PLACE_ALIASES[p.name] ?? [p.name.toLowerCase()]).some((alias) => flat.includes(alias.replace(/\s/g, "")))) return { village: p.name, area: p.area, ...PLACE_FACTS[p.name] };
  }
  return null;
}

// ── Crops ──────────────────────────────────────────────────────────────
const isLatin = (s: string) => /^[a-z ]+$/.test(s);

/** Every crop mentioned in `text`, in the order they were said ("tomato, onion and ragi", "ಟೊಮೇಟೊ ಮತ್ತು ಈರುಳ್ಳಿ"). */
export function findCrops(text: string): CropSlug[] {
  const original = ` ${text.toLowerCase().normalize("NFC").replace(/[,.!?।;:]/g, " ").replace(/\s+/g, " ").trim()} `;
  let rest = original;
  const hits = new Map<CropSlug, number>();
  const add = (slug: CropSlug, at: number) => hits.set(slug, Math.min(hits.get(slug) ?? Infinity, at));
  for (const [term, slug] of CROP_TERMS) {
    const needle = isLatin(term) ? ` ${term} ` : term;
    if (!rest.includes(needle)) continue;
    add(slug, original.indexOf(needle));
    rest = rest.split(needle).join(isLatin(term) ? "  " : " ");
  }
  for (const tok of rest.split(" ")) {
    if (tok.length < 4 || !/^[a-z]+$/.test(tok)) continue;
    const stem = tok.endsWith("es") ? tok.slice(0, -2) : tok.endsWith("s") ? tok.slice(0, -1) : tok;
    const f = fuzzyFind(stem, CROP_TERMS) ?? fuzzyFind(tok, CROP_TERMS);
    if (f) add(f.value, original.indexOf(tok));
  }
  return [...hits.entries()].sort((a, b) => a[1] - b[1]).map(([slug]) => slug);
}

/** The sign-up "What do you sell?" category for a crop. */
export const sellCategory = (slug: CropSlug) => (CROPS[slug].category === "poultry" ? "meat" : CROPS[slug].category);

// ── Commands ───────────────────────────────────────────────────────────
export type GuideCommand = "next" | "back" | "repeat" | "skip";

const COMMANDS: [GuideCommand, string[]][] = [
  ["next", ["next", "next step", "continue", "go ahead", "go next", "done", "aage", "agla", "आगे", "अगला", "आगे चलो", "आगे बढ़ो", "ಮುಂದೆ", "ಮುಂದಕ್ಕೆ", "ಮುಂದೆ ಹೋಗಿ", "ಮುಂದಿನದು"]],
  ["back", ["back", "go back", "previous", "peeche", "पीछे", "वापस", "पिछला", "ಹಿಂದೆ", "ಹಿಂದಕ್ಕೆ", "ಹಿಂದೆ ಹೋಗಿ"]],
  ["repeat", ["repeat", "again", "say again", "say that again", "pardon", "phir se", "dobara", "फिर से", "दोबारा", "फिर से बोलो", "ಮತ್ತೆ", "ಮತ್ತೊಮ್ಮೆ", "ಮತ್ತೆ ಹೇಳಿ"]],
  ["skip", ["skip", "skip it", "later", "chhodo", "baad mein", "छोड़ो", "छोड़ दो", "बाद में", "ಬಿಟ್ಟುಬಿಡಿ", "ಬಿಡಿ", "ನಂತರ", "ಸ್ಕಿಪ್"]],
];
const FILLER = /^(?:ok|okay|please|हाँ|ठीक है|ಸರಿ)\s+|\s+(?:please|करो|कीजिए|ಮಾಡಿ)$/g;

/** A whole-utterance guide command ("next", "ಮುಂದೆ", "फिर से"), or null for an ordinary answer. */
export function guideCommand(text: string): GuideCommand | null {
  const t = text.toLowerCase().normalize("NFC").replace(/[.,!?।]/g, "").replace(/\s+/g, " ").trim().replace(FILLER, "").trim();
  return COMMANDS.find(([, words]) => words.includes(t))?.[0] ?? null;
}
