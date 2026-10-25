// Every prompt FoodFlow sends to a model lives here. All of them demand
// strict JSON matching the Zod schemas in ./schemas.ts.
import { CROP_SLUGS } from "@/lib/crops";
import type { Lang } from "@/lib/i18n";
import { QUALITY_FLAGS } from "./schemas";

const LANGUAGE_NAME: Record<Lang, string> = { en: "English", hi: "Hindi (Devanagari script)", kn: "Kannada (Kannada script)" };

/** Instruction that makes the model write for a farmer with little schooling, in their language. */
function plainWords(lang: Lang): string {
  return `Write in ${LANGUAGE_NAME[lang]}, in very simple everyday words and short sentences, for a farmer with little schooling. Keep every number, ₹ amount, unit and place name exactly as given.`;
}

const JSON_RULE = "Respond with a single JSON object only, no markdown, no commentary. Never use em dashes in any text you write.";

export const qualityPrompt = {
  system: `You inspect photos of freshly harvested produce for an Indian farm-to-table marketplace.
You give a VISUAL assessment only, you cannot judge taste, pesticide residue, or food safety, and must not claim to.
Be conservative: if photos are dark, blurry, or not produce, say so via flags and lower the score. ${JSON_RULE}`,
  user: (crop: string | null, frames: number) =>
    `Assess these ${frames} photo(s)${crop ? ` of ${crop}` : ""}.
Return JSON: {"score": integer 0-100, "grade": "A"|"B"|"C", "flags": string[], "summary": string}
- grade A ≥ 85, B 70–84, C < 70
- flags only from: ${QUALITY_FLAGS.join(", ")}
- summary: one or two plain sentences a farmer and a buyer can both understand, describing colour, firmness cues, uniformity and any defects you can SEE.`,
};

export const parseListingPrompt = {
  system: `You turn a farmer's spoken description of a harvest (Hindi, Kannada, Tamil, Telugu, English or a mix, possibly transliterated) into structured listing fields.
Never invent values that were not said, use null and list the field in "missing". ${JSON_RULE}`,
  user: (transcript: string, lang: string, today: string) =>
    `Speech language hint: ${lang}. Today's date: ${today}.
Transcript: """${transcript}"""
Return JSON: {"crop": one of [${CROP_SLUGS.join(", ")}] or null, "qty": number|null, "unit": "kg"|"litre"|"dozen"|null, "harvestDate": "YYYY-MM-DD"|null, "price": number (₹ per unit)|null, "missing": string[] of the null fields among crop, qty, unit, harvestDate, price}
Rules: "aaj/आज/ಇವತ್ತು/ಇಂದು" = today; "kal/कल/ನಿನ್ನೆ" when talking about picking = yesterday; 1 quintal = 100 kg; price is per unit, not total.`,
};

export const parseDemandPrompt = {
  system: `You turn a restaurant, hostel or community kitchen's spoken bulk produce requirement (Indian languages or English, possibly transliterated) into structured fields. Never invent values; use null and list them in "missing". ${JSON_RULE}`,
  user: (transcript: string, lang: string, nowIso: string) =>
    `Speech language hint: ${lang}. Current time: ${nowIso} (Asia/Kolkata).
Transcript: """${transcript}"""
Return JSON: {"crop": one of [${CROP_SLUGS.join(", ")}] or null, "qtyKg": number|null, "targetPrice": number (₹ per kg)|null, "deadline": ISO date-time|null, "urgent": boolean, "recurring": boolean, "frequency": "DAILY"|"WEEKLY"|null, "grade": "A"|"B"|"C"|"ANY", "missing": string[] of null fields among crop, qtyKg, targetPrice, deadline}
Rules: "kal tak / कल तक / ನಾಳೆ" means BY TOMORROW (deadline ~9 AM tomorrow); "jaldi/turant/urgent" = urgent; "har hafte/weekly" = recurring WEEKLY; 1 quintal = 100 kg.`,
};

export const groceryPrompt = {
  system: `You read household grocery lists (handwritten or typed, English or Indian languages) and output structured items for a fresh-produce shop. ${JSON_RULE}`,
  user: (text?: string) =>
    `${text ? `List text: """${text}"""` : "Read the grocery list in the photo."}
Return JSON: {"items": [{"name": string (English, lowercase, singular, e.g. "tomato"), "qty": number, "unit": "kg"|"litre"|"dozen"|"piece"}]}
Convert grams to kg (500g → 0.5 kg) and ml to litres. If no quantity is written, use 1 with the most natural unit.`,
};

export const priceExplainPrompt = {
  system: `You explain an already-computed indicative price suggestion to a smallholder farmer in short, plain sentences. Do not change the numbers. ${JSON_RULE}`,
  user: (facts: string, lang: Lang = "en") =>
    `Facts:\n${facts}\n${plainWords(lang)}\nReturn JSON: {"basis": string[] (2–4 short bullet sentences explaining why this price is suggested)}`,
};

export const rankOffersPrompt = {
  system: `You help a restaurant or community kitchen compare farmer offers for a bulk produce requirement. You are given pre-computed factor scores; weigh them sensibly and explain briefly. ${JSON_RULE}`,
  user: (demand: string, offers: string) =>
    `Requirement:\n${demand}\n\nOffers (with computed factors, each 0–1):\n${offers}
Return JSON: {"ranking": [{"offerId": string, "score": 0-100, "reason": one short sentence naming the deciding factor}]}, include every offer, best first.`,
};

export const surplusPrompt = {
  system: `You advise a farmer whose listing is selling slowly, so produce isn't wasted. Suggestions must be actions the farmer can take on FoodFlow; never suggest dumping. ${JSON_RULE}`,
  user: (facts: string, lang: Lang = "en") =>
    `Facts:\n${facts}\n${plainWords(lang)}\nReturn JSON: {"reasons": string[] (why it's at risk), "suggestions": string[] (concrete next steps, most impactful first)}`,
};
