// Understanding an utterance: the rule parser always runs first; the model
// (Gemini, strict Zod-validated JSON) is asked only when the rules aren't
// confident. The model returns { intent, entities, confidence, missing } —
// it never sees or touches the database.
import "server-only";
import { withFallback } from "@/lib/ai";
import { CROP_SLUGS } from "@/lib/crops";
import { INTENTS, parseResultSchema, REQUIRED, type AssistantContext, type AssistantLang, type ParseResult } from "./intents";
import { parseUtterance } from "./parse";

/** Rules at or above this confidence are used without asking the model. */
export const RULES_CONFIDENT = 0.75;

const SYSTEM = `You classify what an Indian farmer said to a farm-marketplace assistant (English, Hindi, Kannada, or a code-mixed mix, possibly romanised).
Return ONLY JSON. Never invent numbers, crops or dates that were not said — use null and list the field in "missing".
Intents: ${INTENTS.join(", ")}.
Crops (use the slug): ${CROP_SLUGS.join(", ")}. 1 quintal = 100 kg. Prices are per unit, not totals.`;

function prompt(text: string, lang: AssistantLang, today: string) {
  return `Language hint: ${lang}. Today: ${today}.
Utterance: """${text}"""
Return JSON: {"intent": one of the intents, "entities": {"crop": slug|null, "qty": number|null, "unit": "kg"|"litre"|"dozen"|null, "price": number|null, "harvestDate": "YYYY-MM-DD"|null, "period": "today"|"week"|"month"|"all"|null, "orderCode": "FF-XXXXX"|null}, "confidence": 0..1, "missing": string[]}`;
}

/** Drops nulls so entity merging stays simple. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as T;
}

/**
 * Understands one utterance.
 * @returns the parse plus which path produced it
 */
export async function understand(text: string, lang: AssistantLang, ctx?: AssistantContext): Promise<ParseResult & { source: "rules" | "ai"; normalised: string }> {
  const rules = parseUtterance(text, ctx);
  if (rules.confidence >= RULES_CONFIDENT || ctx?.pending) return { ...rules, source: "rules" };

  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ai = await withFallback<ParseResult | null>(
    "assistant-intent",
    (p) => p.generateJSON({ task: "assistant-intent", system: SYSTEM, prompt: prompt(text, lang, today), schema: parseResultSchema, temperature: 0 }),
    () => null,
  );
  if (ai.source !== "ai" || !ai.data || ai.data.confidence <= rules.confidence) return { ...rules, source: "rules" };

  // Model chose the intent; anything the rules extracted with certainty wins.
  const entities = { ...compact(ai.data.entities), ...compact(rules.intent === ai.data.intent ? rules.entities : {}) };
  if (ai.data.intent === "PUBLISH_LISTING" && ctx?.lastDraftId) entities.draftId = ctx.lastDraftId;
  const missing = (REQUIRED[ai.data.intent] ?? []).filter((f) => entities[f] == null);
  return { intent: ai.data.intent, entities, confidence: Math.min(ai.data.confidence, missing.length ? 0.6 : 1), missing, source: "ai", normalised: rules.normalised };
}
