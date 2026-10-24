// Rule parser accuracy on the multilingual utterance fixtures (≥90% per
// language), plus follow-up merging and yes/no answers.
import { describe, expect, it } from "vitest";
import { FIXTURE_NOW, UTTERANCES, type Utterance } from "@/lib/assistant/__tests__/utterances";
import { yesNo } from "@/lib/assistant/lexicon";
import { parseUtterance } from "@/lib/assistant/parse";

function passes(u: Utterance): { ok: boolean; why: string } {
  const r = parseUtterance(u.text, undefined, FIXTURE_NOW);
  if (r.intent !== u.intent) return { ok: false, why: `intent ${r.intent} ≠ ${u.intent}` };
  for (const [k, v] of Object.entries(u.entities ?? {})) {
    const got = (r.entities as Record<string, unknown>)[k];
    if (got !== v) return { ok: false, why: `${k}=${String(got)} ≠ ${String(v)}` };
  }
  return { ok: true, why: "" };
}

describe("rule parser fixtures", () => {
  for (const lang of ["en", "hi", "kn"] as const) {
    it(`passes ≥90% of ${lang} utterances`, () => {
      const set = UTTERANCES.filter((u) => u.lang === lang);
      expect(set.length).toBeGreaterThanOrEqual(15);
      const results = set.map((u) => ({ u, ...passes(u) }));
      const failed = results.filter((r) => !r.ok);
      const rate = (set.length - failed.length) / set.length;
      console.log(`[parser] ${lang}: ${set.length - failed.length}/${set.length} (${Math.round(rate * 100)}%)${failed.map((f) => `\n  ✗ "${f.u.text}" — ${f.why}`).join("")}`);
      expect(rate).toBeGreaterThanOrEqual(0.9);
    });
  }
});

describe("follow-ups", () => {
  it("a bare number answers the missing price of a draft", () => {
    const r = parseUtterance("25", { pending: { intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, unit: "kg", draftId: "d1" } } });
    expect(r.intent).toBe("CREATE_LISTING_DRAFT");
    expect(r.entities).toMatchObject({ crop: "tomato", qty: 50, price: 25, draftId: "d1" });
  });
  it("a crop name answers a missing crop", () => {
    const r = parseUtterance("ಈರುಳ್ಳಿ", { pending: { intent: "UPDATE_STOCK", entities: { qty: 20, unit: "kg" } } });
    expect(r.intent).toBe("UPDATE_STOCK");
    expect(r.entities.crop).toBe("onion");
    expect(r.missing).toEqual([]);
  });
  it("a new full request replaces the pending one", () => {
    const r = parseUtterance("How much did I earn today?", { pending: { intent: "UPDATE_STOCK", entities: { qty: 20 } } });
    expect(r.intent).toBe("CHECK_EARNINGS");
  });
  it("asks for what's missing instead of guessing", () => {
    const r = parseUtterance("I want to sell tomatoes");
    expect(r.intent).toBe("CREATE_LISTING_DRAFT");
    expect(r.missing).toContain("qty");
    expect(r.confidence).toBeLessThanOrEqual(0.6);
  });
});

describe("yes / no", () => {
  it.each([
    ["yes", "yes"], ["haan", "yes"], ["ಹೌದು", "yes"], ["हाँ", "yes"], ["theek hai", "yes"], ["sari", "yes"],
    ["no", "no"], ["nahi", "no"], ["ಇಲ್ಲ", "no"], ["cancel", "no"], ["ಬೇಡ", "no"],
    ["50 kilo tomato", null],
  ])("%s → %s", (text, expected) => {
    expect(yesNo(text)).toBe(expected);
  });
});
