// Spoken-number normaliser: English, Hindi and Kannada words (script and
// romanised), compounds, multipliers, fractions and native digits.
import { describe, expect, it } from "vitest";
import { normaliseSpokenNumbers, parseSpokenNumber } from "@/lib/assistant/numbers";

const CASES: [string, number][] = [
  // English
  ["fifty", 50],
  ["twenty five", 25],
  ["two hundred", 200],
  ["one hundred twenty five", 125],
  ["three thousand five hundred", 3500],
  ["half", 0.5],
  ["two point five", 2.5],
  ["forty two", 42],
  // Hindi — Devanagari
  ["पचास", 50],
  ["पच्चीस", 25],
  ["बत्तीस", 32],
  ["सत्तासी", 87],
  ["डेढ़ सौ", 150],
  ["ढाई", 2.5],
  ["दो सौ पचास", 250],
  ["साढ़े तीन सौ", 350],
  ["सवा सौ", 125],
  ["पौने दो सौ", 175],
  ["एक हज़ार", 1000],
  // Hindi — romanised
  ["pachaas", 50],
  ["pachees", 25],
  ["dedh sau", 150],
  ["dhai", 2.5],
  ["do sau pachaas", 250],
  ["saadhe teen", 3.5],
  ["chaalees", 40],
  ["do hazaar paanch sau", 2500],
  // Kannada — script
  ["ಐವತ್ತು", 50],
  ["ಇಪ್ಪತ್ತೈದು", 25],
  ["ಮೂವತ್ತೆರಡು", 32],
  ["ನಲವತ್ತೆಂಟು", 48],
  ["ತೊಂಬತ್ತೊಂಬತ್ತು", 99],
  ["ಹದಿನೈದು", 15],
  ["ನೂರು", 100],
  ["ಇನ್ನೂರ ಐವತ್ತು", 250],
  ["ಎರಡೂವರೆ", 2.5],
  ["ಎರಡು ಸಾವಿರ", 2000],
  // Kannada — romanised
  ["aivattu", 50],
  ["ippattaidu", 25],
  ["moovattu", 30],
  ["nooru", 100],
  // Native digits
  ["५०", 50],
  ["೨೫", 25],
  ["१५०", 150],
  ["೪೦", 40],
];

describe("parseSpokenNumber", () => {
  it.each(CASES)("%s → %d", (phrase, expected) => {
    expect(parseSpokenNumber(phrase)).toBe(expected);
  });

  it("rejects phrases that aren't numbers", () => {
    expect(parseSpokenNumber("tomato")).toBeNull();
    expect(parseSpokenNumber("50 kilo")).toBeNull();
  });
});

describe("normaliseSpokenNumbers in sentences", () => {
  it("handles code-mixed listing speech", () => {
    expect(normaliseSpokenNumbers("pachaas kilo tamatar pachees rupaye kilo")).toBe("50 kilo tamatar 25 rupaye kilo");
    expect(normaliseSpokenNumbers("ಐವತ್ತು ಕಿಲೋ ಟೊಮೇಟೊ ಕಿಲೋಗೆ ಇಪ್ಪತ್ತೈದು ರೂಪಾಯಿ")).toBe("50 ಕಿಲೋ ಟೊಮೇಟೊ ಕಿಲೋಗೆ 25 ರೂಪಾಯಿ");
    expect(normaliseSpokenNumbers("dedh sau kilo pyaaz")).toBe("150 kilo pyaaz");
  });
  it("keeps separate numbers apart", () => {
    expect(normaliseSpokenNumbers("50 kilo tomato 25 rupees")).toBe("50 kilo tomato 25 rupees");
    expect(normaliseSpokenNumbers("fifty kilo at twenty five")).toBe("50 kilo at 25");
  });
  it("only reads ambiguous words as numbers next to a unit or number", () => {
    expect(normaliseSpokenNumbers("how much do i have")).toBe("how much do i have");
    expect(normaliseSpokenNumbers("do kilo aloo")).toBe("2 kilo aloo");
    expect(normaliseSpokenNumbers("which one is mine")).toBe("which one is mine");
    expect(normaliseSpokenNumbers("ek kilo")).toBe("1 kilo");
  });
});
