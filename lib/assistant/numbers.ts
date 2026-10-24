// Spoken-number normaliser for Sakhi (English, Hindi, Kannada —
// native script and romanised). Turns "पचास", "ಐವತ್ತು", "fifty",
// "dedh sau", "do sau pachaas", "saadhe teen" and ೫೦ / ५० into digits so
// the intent parser only ever sees plain numbers.
import { asciiDigits } from "@/lib/ai/fallback/numbers";

type Kind = "num" | "mult" | "pre";
interface Word {
  kind: Kind;
  value: number;
}

const W = new Map<string, Word>();
const num = (value: number, ...words: string[]) => words.forEach((w) => W.set(w, { kind: "num", value }));
const mult = (value: number, ...words: string[]) => words.forEach((w) => W.set(w, { kind: "mult", value }));
/** Prefix fractions: sava (+¼), saadhe (+½), paune (−¼). */
const pre = (value: number, ...words: string[]) => words.forEach((w) => W.set(w, { kind: "pre", value }));

// ── English ────────────────────────────────────────────────────────────
const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
EN_ONES.forEach((w, i) => num(i, w));
["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"].forEach((w, i) => num((i + 2) * 10, w));
num(0.5, "half");
mult(100, "hundred");
mult(1000, "thousand");
mult(100000, "lakh", "lac");

// ── Hindi (Devanagari, 1–100) ──────────────────────────────────────────
const HI_DEVA = "एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे".split(" ");
HI_DEVA.forEach((w, i) => num(i + 1, w));
num(5, "पांच");
num(6, "छः", "छे");
num(0.5, "आधा", "आधे");
num(1.5, "डेढ़", "डेढ");
num(2.5, "ढाई");
mult(100, "सौ");
mult(1000, "हज़ार", "हजार");
mult(100000, "लाख");
pre(0.25, "सवा");
pre(0.5, "साढ़े", "साढे");
pre(-0.25, "पौने");

// ── Hindi (romanised, 1–100; common spellings) ─────────────────────────
const HI_ROMAN: [number, string[]][] = [
  [1, ["ek"]], [2, ["do"]], [3, ["teen", "tin"]], [4, ["char", "chaar"]], [5, ["paanch", "panch", "paach"]], [6, ["chhe", "chhah", "che", "chhai"]],
  [7, ["saat", "sat"]], [8, ["aath", "ath"]], [9, ["nau"]], [10, ["das"]], [11, ["gyarah", "gyara"]], [12, ["barah", "bara", "baarah"]],
  [13, ["terah", "tera"]], [14, ["chaudah", "chauda"]], [15, ["pandrah", "pandra"]], [16, ["solah", "sola"]], [17, ["satrah", "satra"]],
  [18, ["atharah", "athara", "attharah"]], [19, ["unnis", "unees"]], [20, ["bees", "bis"]], [21, ["ikkees", "ikkis"]], [22, ["baees", "bais", "baaees"]],
  [23, ["teis", "tees teen"]], [24, ["chaubees", "chobis", "chaubis"]], [25, ["pachees", "pachchees", "pachis", "pachchis", "pacchis"]],
  [26, ["chhabbees", "chabbis"]], [27, ["sattaees", "sattais"]], [28, ["atthaees", "atthais", "athais"]], [29, ["untees", "untis"]], [30, ["tees", "tis"]],
  [31, ["ikattees", "iktis"]], [32, ["battees", "battis"]], [33, ["taintees", "taintis"]], [34, ["chautees", "chautis"]], [35, ["paintees", "paintis"]],
  [36, ["chhattees", "chattis"]], [37, ["saintees", "saintis"]], [38, ["adtees", "artis", "adtis"]], [39, ["untaalees", "untalis"]], [40, ["chaalees", "chalis", "chaalis"]],
  [41, ["iktaalees", "iktalis"]], [42, ["bayaalees", "bayalis"]], [43, ["taintaalees", "taintalis"]], [44, ["chavaalees", "chawalis"]], [45, ["paintaalees", "paintalis"]],
  [46, ["chhiyaalees", "chiyalis"]], [47, ["saintaalees", "saintalis"]], [48, ["adtaalees", "artalis"]], [49, ["unchaas", "unchas"]], [50, ["pachaas", "pachas", "pachaass"]],
  [51, ["ikyaavan", "ikyavan"]], [52, ["baavan", "bavan"]], [53, ["tirpan"]], [54, ["chauvan", "chauwan"]], [55, ["pachpan"]], [56, ["chhappan", "chappan"]],
  [57, ["sattaavan", "sattavan"]], [58, ["atthaavan", "atthavan"]], [59, ["unsath"]], [60, ["saath"]], [61, ["iksath"]], [62, ["baasath", "basath"]],
  [63, ["tirsath"]], [64, ["chausath", "chaunsath"]], [65, ["painsath"]], [66, ["chhiyaasath", "chiyasath"]], [67, ["sadsath"]], [68, ["adsath"]],
  [69, ["unhattar"]], [70, ["sattar"]], [71, ["ikhattar"]], [72, ["bahattar"]], [73, ["tihattar"]], [74, ["chauhattar"]], [75, ["pachhattar", "pachattar"]],
  [76, ["chhihattar"]], [77, ["satattar", "sathattar"]], [78, ["athhattar", "atthattar"]], [79, ["unaasi", "unasi"]], [80, ["assi"]], [81, ["ikyaasi"]],
  [82, ["bayaasi"]], [83, ["tiraasi"]], [84, ["chauraasi", "chaurasi"]], [85, ["pachaasi", "pachasi"]], [86, ["chhiyaasi"]], [87, ["sataasi"]],
  [88, ["athaasi", "atthasi"]], [89, ["navaasi", "nawasi"]], [90, ["nabbe"]], [91, ["ikyaanve"]], [92, ["baanve"]], [93, ["tiraanve"]], [94, ["chauraanve"]],
  [95, ["pachaanve", "pachanve"]], [96, ["chhiyaanve"]], [97, ["sattaanve"]], [98, ["atthaanve"]], [99, ["ninyaanve", "ninyanve"]],
];
HI_ROMAN.forEach(([v, ws]) => num(v, ...ws.filter((w) => !w.includes(" "))));
num(0.5, "aadha", "adha", "aadhe");
num(1.5, "dedh", "dhed", "derh");
num(2.5, "dhai", "dhaai", "adhai", "adhaai");
mult(100, "sau");
mult(1000, "hazaar", "hazar", "hajar", "hajaar");
pre(0.25, "sava", "sawa");
pre(0.5, "saadhe", "sadhe", "saade", "sade");
pre(-0.25, "paune", "pone");

// ── Kannada (script) ───────────────────────────────────────────────────
const KN_1_19 = "ಒಂದು ಎರಡು ಮೂರು ನಾಲ್ಕು ಐದು ಆರು ಏಳು ಎಂಟು ಒಂಬತ್ತು ಹತ್ತು ಹನ್ನೊಂದು ಹನ್ನೆರಡು ಹದಿಮೂರು ಹದಿನಾಲ್ಕು ಹದಿನೈದು ಹದಿನಾರು ಹದಿನೇಳು ಹದಿನೆಂಟು ಹತ್ತೊಂಬತ್ತು".split(" ");
KN_1_19.forEach((w, i) => num(i + 1, w));
const KN_TENS = ["ಇಪ್ಪತ್ತು", "ಮೂವತ್ತು", "ನಲವತ್ತು", "ಐವತ್ತು", "ಅರವತ್ತು", "ಎಪ್ಪತ್ತು", "ಎಂಬತ್ತು", "ತೊಂಬತ್ತು"];
// Compound suffix for 1–9 after a tens stem ("ಇಪ್ಪತ್ತ" + "ೈದು" = ಇಪ್ಪತ್ತೈದು).
const KN_UNIT_SUFFIX = ["ೊಂದು", "ೆರಡು", "ಮೂರು", "ನಾಲ್ಕು", "ೈದು", "ಾರು", "ೇಳು", "ೆಂಟು", "ೊಂಬತ್ತು"];
KN_TENS.forEach((w, i) => {
  const tens = (i + 2) * 10;
  num(tens, w);
  const stem = w.slice(0, -1); // drop the final ು vowel sign
  KN_UNIT_SUFFIX.forEach((s, u) => num(tens + u + 1, stem + s));
});
num(40, "ನಲ್ವತ್ತು");
num(0.5, "ಅರ್ಧ");
["ಒಂದೂವರೆ", "ಎರಡೂವರೆ", "ಮೂರೂವರೆ", "ನಾಲ್ಕೂವರೆ", "ಐದೂವರೆ"].forEach((w, i) => num(i + 1.5, w));
num(100, "ನೂರು");
// Hundreds as standalone words and as compound stems ("ಇನ್ನೂರ ಐವತ್ತು" = 250).
[["ನೂರ", 100], ["ಇನ್ನೂರು", 200], ["ಇನ್ನೂರ", 200], ["ಮುನ್ನೂರು", 300], ["ಮುನ್ನೂರ", 300], ["ನಾನೂರು", 400], ["ನಾನೂರ", 400], ["ಐನೂರು", 500], ["ಐನೂರ", 500]].forEach(([w, v]) => num(v as number, w as string));
mult(1000, "ಸಾವಿರ");

// ── Kannada (romanised) ────────────────────────────────────────────────
const KN_ROMAN_1_19: string[][] = [
  ["ondu"], ["eradu", "yeradu"], ["mooru", "muru"], ["naalku", "nalku"], ["aidu", "eidu", "aydu"], ["aaru", "aru"], ["elu", "yelu", "ēlu"], ["entu", "yentu"], ["ombattu"],
  ["hattu"], ["hannondu"], ["hanneradu"], ["hadimooru"], ["hadinaalku"], ["hadinaidu"], ["hadinaaru"], ["hadinelu"], ["hadinentu"], ["hattombattu"],
];
KN_ROMAN_1_19.forEach((ws, i) => num(i + 1, ...ws));
const KN_ROMAN_TENS: [string, string[]][] = [
  ["ippatt", ["ippattu"]], ["moovatt", ["moovattu", "muvattu"]], ["nalavatt", ["nalavattu", "nalvattu"]], ["aivatt", ["aivattu", "ivattu", "aiwattu"]],
  ["aravatt", ["aravattu"]], ["eppatt", ["eppattu"]], ["embatt", ["embattu"]], ["tombatt", ["tombattu", "thombattu"]],
];
const KN_ROMAN_UNIT = ["ondu", "eradu", "mooru", "naalku", "aidu", "aaru", "elu", "entu", "ombattu"];
KN_ROMAN_TENS.forEach(([stem, words], i) => {
  const tens = (i + 2) * 10;
  num(tens, ...words);
  KN_ROMAN_UNIT.forEach((u, k) => num(tens + k + 1, stem + u));
});
num(100, "nooru", "nuru");
num(200, "innooru");
num(300, "munnooru");
num(400, "naanooru");
num(500, "ainooru");
mult(1000, "saavira", "savira");
num(0.5, "ardha");

/** Words that are also common non-number words; converted only next to a unit, number or multiplier. */
const AMBIGUOUS = new Set(["one", "do", "दो", "ek", "एक", "teen", "tin", "saath", "sat", "das", "aru", "elu", "bis", "bara", "sola", "che"]);
const UNIT_HINT = /^(kg|kgs|kilo|kilos|kilogram|किलो|ಕಿಲೋ|ಕೆಜಿ|quintal|क्विंटल|ಕ್ವಿಂಟಲ್|dozen|दर्जन|ಡಜನ್|litre|liter|लीटर|ಲೀಟರ್|rupaye|rupees|rs|रुपये|रुपए|ರೂಪಾಯಿ|gram|ग्राम|tons?$|tonnes?$|टन|ಟನ್|km$)/;

/** Value of one token, or null when it isn't a number word or numeral. */
function tokenValue(tok: string): Word | null {
  if (/^\d+(\.\d+)?$/.test(tok)) return { kind: "num", value: Number(tok) };
  return W.get(tok) ?? null;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Replaces spoken numbers in `text` with digits. Native digits become
 * ASCII first; number words and compounds ("do sau pachaas" → 250,
 * "twenty five" → 25, "saadhe teen sau" → 350) are folded into one value.
 */
export function normaliseSpokenNumbers(text: string): string {
  const tokens = asciiDigits(text).split(/(\s+)/);
  const words = tokens.filter((t) => !/^\s+$/.test(t));
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const start = parseNumberAt(words, i);
    if (!start) {
      out.push(words[i]);
      i += 1;
      continue;
    }
    out.push(fmt(start.value));
    i = start.end;
  }
  return out.join(" ");
}

/** Parses the longest number phrase starting at `i`, or null. */
function parseNumberAt(words: string[], i: number): { value: number; end: number } | null {
  const first = words[i];
  const lower = first.toLowerCase();
  if (AMBIGUOUS.has(lower)) {
    const next = (words[i + 1] ?? "").toLowerCase();
    const nextVal = tokenValue(next);
    if (!UNIT_HINT.test(next) && !nextVal && !/^₹/.test(next)) return null;
  }
  let total = 0;
  let current = 0;
  let last = 0; // last additive term, to decide whether the next word continues the number
  let prefix = 0;
  let consumed = 0;
  let started = false; // a value (not just a prefix like "saadhe") has been read
  let j = i;
  for (; j < words.length; j++) {
    const w = tokenValue(words[j].toLowerCase());
    if (!w) {
      if (/^(and|aur|और|mattu|ಮತ್ತು)$/i.test(words[j]) && consumed && tokenValue((words[j + 1] ?? "").toLowerCase())) continue;
      if (/^point$/i.test(words[j]) && consumed) {
        const d = tokenValue((words[j + 1] ?? "").toLowerCase());
        if (d && d.kind === "num" && d.value < 10) {
          current += d.value / 10;
          j += 1;
          continue;
        }
      }
      break;
    }
    if (w.kind === "pre") {
      if (consumed && !prefix) break;
      prefix = w.value;
      consumed += 1;
      continue;
    }
    if (w.kind === "mult") {
      // "sau" alone = 100; "sava sau" = 125; "saadhe teen sau" = 350 (prefix already in current).
      const base = current ? current : 1 + prefix;
      if (w.value >= 1000) {
        total += base * w.value;
        current = 0;
      } else {
        current = base * w.value;
      }
      prefix = 0;
      last = w.value;
      consumed += 1;
      started = true;
      continue;
    }
    // A plain number: start, or continue a compound ("twenty" + "five", "do sau" + "pachaas").
    const v = w.value + prefix;
    prefix = 0;
    if (!started) {
      current = v;
      last = v;
      started = true;
    } else {
      const continues = (last >= 20 && last < 100 && last % 10 === 0 && v < 10) || (last >= 100 && v < last && current % 100 === 0) || (total > 0 && current === 0 && v < 1000);
      if (!continues) break;
      current += v;
      last = v;
    }
    consumed += 1;
  }
  if (!consumed) return null;
  if (prefix && !current && !total) return null; // a dangling "sava" etc.
  return { value: total + current, end: j };
}

/**
 * Value of a whole spoken phrase ("ಇಪ್ಪತ್ತೈದು", "dedh sau"), or null when
 * the phrase isn't purely a number. Used by tests and follow-up answers.
 */
export function parseSpokenNumber(phrase: string): number | null {
  const words = asciiDigits(phrase.trim().toLowerCase()).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const r = parseNumberAt(words, 0);
  return r && r.end === words.length ? Math.round(r.value * 100) / 100 : null;
}
