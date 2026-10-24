// Unit tests for the offline AI fallbacks: voice-listing parser (Hindi,
// Kannada, English, romanised) and grocery-list parser.
import { describe, expect, it } from "vitest";
import { parseGroceryFallback } from "@/lib/ai/fallback/grocery-parser";
import { isoDay, parseListingFallback } from "@/lib/ai/fallback/listing-parser";
import { normaliseNumbers } from "@/lib/ai/fallback/numbers";

const NOW = new Date(2026, 9, 20, 10, 0, 0); // 20 Oct 2026
const today = isoDay(NOW);
const yesterday = isoDay(new Date(2026, 9, 19));

describe("normaliseNumbers", () => {
  it("converts native digits and number words", () => {
    expect(normaliseNumbers("५० किलो")).toBe("50 किलो");
    expect(normaliseNumbers("ಐವತ್ತು ಕೆಜಿ")).toBe("50 ಕೆಜಿ");
    expect(normaliseNumbers("pachees rupaye")).toBe("25 rupaye");
    expect(normaliseNumbers("onion ten kg")).toBe("onion 10 kg");
  });
});

describe("parseListingFallback", () => {
  it("parses romanised Hindi from the demo script", () => {
    expect(parseListingFallback("50 kilo tamatar, aaj tode, 25 rupaye kilo", NOW)).toEqual({
      crop: "tomato",
      qty: 50,
      unit: "kg",
      harvestDate: today,
      price: 25,
      missing: [],
    });
  });

  it("parses Devanagari Hindi from hi-IN speech recognition", () => {
    const r = parseListingFallback("50 किलो टमाटर आज तोड़े 25 रुपये किलो", NOW);
    expect(r).toMatchObject({ crop: "tomato", qty: 50, unit: "kg", harvestDate: today, price: 25 });
  });

  it("parses Kannada with number words", () => {
    const r = parseListingFallback("ಐವತ್ತು ಕೆಜಿ ಈರುಳ್ಳಿ ನಿನ್ನೆ ಕೊಯ್ಲು ಕೆಜಿಗೆ 30 ರೂಪಾಯಿ", NOW);
    expect(r).toMatchObject({ crop: "onion", qty: 50, unit: "kg", harvestDate: yesterday, price: 30 });
  });

  it("converts quintals and reads rupee symbols", () => {
    const r = parseListingFallback("2 quintal potato harvested today ₹22 per kg", NOW);
    expect(r).toMatchObject({ crop: "potato", qty: 200, unit: "kg", price: 22 });
  });

  it("reports missing fields instead of guessing", () => {
    const r = parseListingFallback("palak hai", NOW);
    expect(r.crop).toBe("spinach");
    expect(r.missing).toEqual(["qty", "unit", "harvestDate", "price"]);
  });

  it("uses the crop's default unit when none was said", () => {
    const r = parseListingFallback("30 doodh aaj", NOW);
    expect(r).toMatchObject({ crop: "milk", qty: 30, unit: "litre" });
  });
});

describe("parseGroceryFallback", () => {
  it("parses a mixed typed list", () => {
    const { items } = parseGroceryFallback("2 kg onion\ntomato 1kg, milk 2 L, eggs 1 dozen\n500g palak");
    expect(items).toEqual([
      { name: "onion", qty: 2, unit: "kg" },
      { name: "tomato", qty: 1, unit: "kg" },
      { name: "milk", qty: 2, unit: "litre" },
      { name: "eggs", qty: 1, unit: "dozen" },
      { name: "spinach", qty: 0.5, unit: "kg" },
    ]);
  });

  it("defaults quantity to 1 with the natural unit", () => {
    const { items } = parseGroceryFallback("carrots and beans aur aloo");
    expect(items.map((i) => [i.name, i.qty, i.unit])).toEqual([
      ["carrot", 1, "kg"],
      ["beans", 1, "kg"],
      ["potato", 1, "kg"],
    ]);
  });

  it("keeps unknown items by name", () => {
    const { items } = parseGroceryFallback("- 1 rice\n- 2 bread");
    expect(items).toEqual([
      { name: "rice", qty: 1, unit: "piece" },
      { name: "bread", qty: 2, unit: "piece" },
    ]);
  });
});
