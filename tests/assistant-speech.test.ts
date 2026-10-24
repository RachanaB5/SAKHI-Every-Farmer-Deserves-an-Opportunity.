// Reply text is reshaped for the voice: amounts and units as words, order
// codes spelled out, no symbols, and sentence-sized chunks.
import { describe, expect, it } from "vitest";
import { splitSentences, toSpoken } from "@/lib/assistant/speech-text";
import { translate } from "@/lib/i18n";

describe("toSpoken", () => {
  it.each([
    ["en", "I've made a draft for 50 kg of Tomato at ₹25 per kg.", "I've made a draft for 50 kilos of Tomato at 25 rupees per kilo."],
    ["en", "You have ₹1,25,000 in confirmed orders.", "You have 1 lakh 25000 rupees in confirmed orders."],
    ["en", "Order FF-7K2QA: ₹1 was settled.", "Order F F 7 K 2 Q A, 1 rupee was settled."],
    ["en", "Market ~₹32/kg", "Market about 32 rupees per kilo"],
    ["en", "You'll get about ₹540 after the buyer's OTP.", "You'll get about 540 rupees after the buyer's O T P."],
    ["hi", "ड्राफ़्ट बना दिया: 50 किलो टमाटर, ₹25 प्रति किलो।", "ड्राफ़्ट बना दिया, 50 किलो टमाटर, 25 रुपये प्रति किलो।"],
    ["kn", "ಕರಡು ಮಾಡಿದ್ದೇನೆ: 50 ಕೆಜಿ ಟೊಮೇಟೊ, ಕೆಜಿಗೆ ₹25.", "ಕರಡು ಮಾಡಿದ್ದೇನೆ, ಐವತ್ತು ಕಿಲೋ ಟೊಮೇಟೊ, ಕಿಲೋಗೆ ಇಪ್ಪತ್ತೈದು ರೂಪಾಯಿ."],
    ["kn", "ಮಾರುಕಟ್ಟೆ ~₹30/ಕೆಜಿ", "ಮಾರುಕಟ್ಟೆ ಸುಮಾರು ಕಿಲೋಗೆ ಮೂವತ್ತು ರೂಪಾಯಿ"],
    ["en", "Try: “50 kilo tomato”.", "Try, 50 kilo tomato."],
  ] as const)("%s: %s", (lang, display, spoken) => {
    expect(toSpoken(display, lang)).toBe(spoken);
  });

  it("leaves no rupee sign, digit grouping or curly quotes in any reply template", () => {
    for (const lang of ["en", "hi", "kn"] as const) {
      const s = toSpoken(translate(lang, "ff.say.earnings", { value: "2,500", period: translate(lang, "ff.period.week"), settled: "0", pending: "1,200", awaiting: "1,300", fee: "125" }), lang);
      expect(s).not.toMatch(/[₹“”]|\d,\d/);
    }
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends in all three scripts", () => {
    expect(splitSentences("Sent for review. An admin checks your photos. I can't publish it myself.")).toEqual(["Sent for review.", "An admin checks your photos.", "I can't publish it myself."]);
    expect(splitSentences("जाँच के लिए भेज दिया। एडमिन आपकी फ़ोटो देखेंगे।")).toEqual(["जाँच के लिए भेज दिया।", "एडमिन आपकी फ़ोटो देखेंगे।"]);
  });
  it("folds a short opener into the next sentence and keeps decimals intact", () => {
    expect(splitSentences("Okay. You have 2.5 kg left.")).toEqual(["Okay. You have 2.5 kg left."]);
  });
});

describe("ranges, distances and slashes", () => {
  it.each([
    ["en", "25–100 kg per week", "25 to 100 kilos per week"],
    ["en", "Within 10 km", "Within 10 kilometres"],
    ["en", "Cash at pickup / delivery", "Cash at pickup, delivery"],
    ["hi", "10 km तक", "10 किलोमीटर तक"],
    ["kn", "25–100 ಕೆಜಿ", "ಇಪ್ಪತ್ತೈದು ರಿಂದ ನೂರು ಕಿಲೋ"],
  ] as const)("%s: %s", (lang, display, spoken) => {
    expect(toSpoken(display, lang)).toBe(spoken);
  });
});
