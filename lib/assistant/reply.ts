// Reply builders for Sakhi: fill the i18n templates with real
// numbers and names in the farmer's language. No free-form text.
import { cropName } from "@/lib/crops";
import { translate, type MessageKey } from "@/lib/i18n";
import type { AssistantLang, Intent } from "./intents";
import type { AssistantReply, Card } from "./types";

type Vars = Record<string, string | number>;

/** Fills one template. */
export const say = (lang: AssistantLang, key: MessageKey, vars?: Vars) => translate(lang, key, vars);

/** Whole-rupee amounts in Indian grouping without the symbol (templates add "₹"), matching the cards. */
export const amount = (n: number) => Math.round(n).toLocaleString("en-IN");
/** Quantities: up to 2 decimals. */
export const qty = (n: number) => String(Math.round(n * 100) / 100);
export const unitWord = (lang: AssistantLang, unit: string) => say(lang, `ff.unit.${unit === "litre" || unit === "dozen" ? unit : "kg"}` as MessageKey);
export const crop = (lang: AssistantLang, slug: string) => cropName(slug, lang);
/** Date in the farmer's language, e.g. "21 Oct". */
export const day = (lang: AssistantLang, d: Date | string) => new Date(d).toLocaleDateString(lang === "en" ? "en-IN" : `${lang}-IN`, { day: "numeric", month: "short" });

/** A plain reply whose speech and display text are the same template. */
export function reply(intent: Intent, lang: AssistantLang, key: MessageKey, vars?: Vars, extra: Partial<AssistantReply> = {}): AssistantReply {
  const text = say(lang, key, vars);
  return { ok: true, intent, lang, speech: text, display: text, ...extra };
}

/** A reply with a card attached. */
export function withCard(r: AssistantReply, card: Card): AssistantReply {
  return { ...r, card };
}
