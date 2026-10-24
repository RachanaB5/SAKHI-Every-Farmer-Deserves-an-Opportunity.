// Offline grocery-list parser for typed or dictated lists such as
// "2 kg onion, tomato 1kg, milk 2 L, eggs 1 dozen, palak". Splits on
// newlines/commas/"and"/"aur", then pulls quantity + unit from each line.
import { CROPS, matchCrop } from "@/lib/crops";
import type { GroceryList } from "../schemas";
import { normaliseNumbers } from "./numbers";

type Unit = GroceryList["items"][number]["unit"];

const UNIT_PATTERNS: { re: RegExp; unit: Unit; factor: number }[] = [
  { re: /^(g|gm|gms|gram|grams|ग्राम)$/, unit: "kg", factor: 0.001 },
  { re: /^(kg|kgs|kilo|kilos|किलो|ಕೆಜಿ)$/, unit: "kg", factor: 1 },
  { re: /^(ml|millilitre|milliliter)$/, unit: "litre", factor: 0.001 },
  { re: /^(l|ltr|ltrs|litre|litres|liter|liters|लीटर|ಲೀಟರ್)$/, unit: "litre", factor: 1 },
  { re: /^(dozen|dozens|doz|darjan|दर्जन)$/, unit: "dozen", factor: 1 },
  { re: /^(pc|pcs|piece|pieces|nos|no)$/, unit: "piece", factor: 1 },
];

/** Splits "1.5kg" into "1.5 kg" so token matching works. */
function spaceUnits(s: string) {
  return s.replace(/(\d)([a-zA-Zऀ-ॿಀ-೿]+)/g, "$1 $2");
}

/**
 * Parses free text into grocery items.
 * @param text - one item per line/comma, any order of name and quantity
 */
export function parseGroceryFallback(text: string): GroceryList {
  const segments = normaliseNumbers(text)
    .split(/\n|,|;|\band\b|\baur\b|और|ಮತ್ತು|\+/)
    // Strip list bullets ("-", "•") and numbering ("1.", "2)") — but not "0.5 kg".
    .map((s) => spaceUnits(s.replace(/^\s*(?:[-*•]+|\d+[.)](?!\d))\s*/, "").trim()))
    .filter(Boolean);

  const items: GroceryList["items"] = [];
  for (const seg of segments) {
    const tokens = seg.split(/\s+/);
    let qty: number | null = null;
    let unit: Unit | null = null;
    const nameTokens: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (/^\d+(\.\d+)?$/.test(tok) && qty === null) {
        qty = Number(tok);
        const u = UNIT_PATTERNS.find((p) => p.re.test(tokens[i + 1] ?? ""));
        if (u) {
          qty *= u.factor;
          unit = u.unit;
          i++;
        }
        continue;
      }
      const u = UNIT_PATTERNS.find((p) => p.re.test(tok));
      if (u && unit === null && qty !== null) {
        qty *= u.factor;
        unit = u.unit;
        continue;
      }
      nameTokens.push(tok);
    }
    const rawName = nameTokens.join(" ").replace(/[^\p{L}\p{M}\s]/gu, "").trim();
    if (!rawName) continue;
    const crop = matchCrop(rawName);
    const name = crop ?? rawName.toLowerCase();
    const defaultUnit: Unit = crop ? (CROPS[crop].unit as Unit) : "piece";
    items.push({ name, qty: Math.round((qty ?? 1) * 1000) / 1000 || 1, unit: unit ?? defaultUnit });
  }
  return { items: items.slice(0, 40) };
}

/** Shown when a photo can't be read without a vision model — clearly marked as a sample. */
export const SAMPLE_GROCERY_LIST: GroceryList = {
  items: [
    { name: "tomato", qty: 1, unit: "kg" },
    { name: "onion", qty: 2, unit: "kg" },
    { name: "spinach", qty: 0.5, unit: "kg" },
    { name: "milk", qty: 2, unit: "litre" },
    { name: "eggs", qty: 1, unit: "dozen" },
  ],
};
