// Tiny i18n layer: typed message keys, English fallback and `{var}`
// interpolation. Farmer UI ships in English, Hindi and Kannada.
import { en, type MessageKey } from "./en";
import { hi } from "./hi";
import { kn } from "./kn";

export type Lang = "en" | "hi" | "kn";
export type { MessageKey };

export const LANGS: { code: Lang; label: string; short: string; speech: string }[] = [
  { code: "en", label: "English", short: "EN", speech: "en-IN" },
  { code: "hi", label: "हिन्दी", short: "हि", speech: "hi-IN" },
  { code: "kn", label: "ಕನ್ನಡ", short: "ಕ", speech: "kn-IN" },
];

const DICTS: Record<Lang, Partial<Record<MessageKey, string>>> = { en, hi, kn };

/** Narrows any stored language code to a UI language we ship. */
export function toLang(code: string | null | undefined): Lang {
  return code === "hi" || code === "kn" ? code : "en";
}

/**
 * Looks up a message and fills `{placeholders}`.
 * @param lang - UI language
 * @param key - message key from en.ts
 * @param vars - placeholder values
 */
export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICTS[lang][key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
