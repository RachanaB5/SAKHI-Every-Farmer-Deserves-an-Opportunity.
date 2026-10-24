// Voice output: Kannada numbers as Kannada words, Kannada readable by a
// Hindi voice when a device has no Kannada one, and the most natural voice
// with Indian pronunciation picked on real browsers' voice lists.
import { describe, expect, it } from "vitest";
import { kannadaForHindiVoice, kannadaNumber, kannadaNumbersToWords, kannadaToDevanagari } from "@/lib/assistant/kannada-speech";
import { genderOf, rankVoices, voicePlan } from "@/lib/assistant/tts";

describe("Kannada numbers", () => {
  it.each([
    [0, "ಸೊನ್ನೆ"],
    [7, "ಏಳು"],
    [15, "ಹದಿನೈದು"],
    [21, "ಇಪ್ಪತ್ತೊಂದು"],
    [25, "ಇಪ್ಪತ್ತೈದು"],
    [40, "ನಲವತ್ತು"],
    [50, "ಐವತ್ತು"],
    [99, "ತೊಂಬತ್ತೊಂಬತ್ತು"],
    [100, "ನೂರು"],
    [125, "ನೂರ ಇಪ್ಪತ್ತೈದು"],
    [250, "ಇನ್ನೂರ ಐವತ್ತು"],
    [900, "ಒಂಬೈನೂರು"],
    [1000, "ಸಾವಿರ"],
    [1200, "ಸಾವಿರದ ಇನ್ನೂರು"],
    [2500, "ಎರಡು ಸಾವಿರದ ಐನೂರು"],
    [100000, "ಒಂದು ಲಕ್ಷ"],
    [125000, "ಒಂದು ಲಕ್ಷದ ಇಪ್ಪತ್ತೈದು ಸಾವಿರ"],
  ])("%i → %s", (n, words) => {
    expect(kannadaNumber(n)).toBe(words);
  });

  it("rewrites numbers inside a sentence, decimals included", () => {
    expect(kannadaNumbersToWords("50 ಕಿಲೋ, ಕಿಲೋಗೆ 25 ರೂಪಾಯಿ")).toBe("ಐವತ್ತು ಕಿಲೋ, ಕಿಲೋಗೆ ಇಪ್ಪತ್ತೈದು ರೂಪಾಯಿ");
    expect(kannadaNumbersToWords("2.5 ಕಿಲೋ")).toBe("ಎರಡು ಪಾಯಿಂಟ್ ಐದು ಕಿಲೋ");
  });
});

describe("Kannada read by a Hindi voice", () => {
  it("maps letters one for one and keeps the final a Kannada says", () => {
    expect(kannadaToDevanagari("ನಮಸ್ಕಾರ")).toBe("नमस्कारा");
    expect(kannadaToDevanagari("ರೈತ ಮಿತ್ರ")).toBe("रैता मित्रा");
    expect(kannadaToDevanagari("ರಮೇಶ್ ಗೌಡ")).toBe("रमेश् गौडा");
    expect(kannadaToDevanagari("ಕಿಲೋಗೆ")).toBe("किलोगे");
  });
  it("uses the long e / o a Hindi voice knows, and keeps other text", () => {
    expect(kannadaToDevanagari("ಎರಡು ಒಂದು")).toBe("एरडु ओंदु");
    expect(kannadaToDevanagari("FoodFlow ಡೆಲಿವರಿ")).toBe("FoodFlow डेलिवरि");
  });
  it("speaks numbers in Kannada, not Hindi", () => {
    expect(kannadaForHindiVoice("ಕಿಲೋಗೆ 25 ರೂಪಾಯಿ")).toBe("किलोगे इप्पत्तैदु रूपायि");
  });
});

/** A browser voice as speechSynthesis reports it. */
const v = (name: string, lang: string, localService = true) => ({ name, lang, localService, voiceURI: name, default: false }) as SpeechSynthesisVoice;

const CHROME_WINDOWS = [
  v("Microsoft Heera - English (India)", "en-IN"),
  v("Microsoft Ravi - English (India)", "en-IN"),
  v("Microsoft Zira - English (United States)", "en-US"),
  v("Google US English", "en-US", false),
  v("Google UK English Female", "en-GB", false),
  v("Google UK English Male", "en-GB", false),
  v("Google हिन्दी", "hi-IN", false),
  v("Microsoft Kalpana - Hindi (India)", "hi-IN"),
];
const EDGE_WINDOWS = [
  v("Microsoft Heera - English (India)", "en-IN"),
  v("Microsoft Neerja Online (Natural) - English (India)", "en-IN", false),
  v("Microsoft Prabhat Online (Natural) - English (India)", "en-IN", false),
  v("Microsoft Swara Online (Natural) - Hindi (India)", "hi-IN", false),
  v("Microsoft Madhur Online (Natural) - Hindi (India)", "hi-IN", false),
  v("Microsoft Sapna Online (Natural) - Kannada (India)", "kn-IN", false),
  v("Microsoft Gagan Online (Natural) - Kannada (India)", "kn-IN", false),
  v("Microsoft Aria Online (Natural) - English (United States)", "en-US", false),
];
const ANDROID = [v("Kannada India", "kn_IN"), v("Hindi India", "hi_IN"), v("English India", "en_IN"), v("English United States", "en_US")];

describe("picking a voice", () => {
  it("prefers Indian English over smoother foreign accents on desktop Chrome", () => {
    expect(rankVoices(CHROME_WINDOWS, "en")[0].lang).toBe("en-IN");
  });
  it("picks Edge's natural Indian voices for all three languages", () => {
    expect(voicePlan(EDGE_WINDOWS, "en")?.voice.name).toMatch(/Natural\) - English \(India\)/);
    expect(voicePlan(EDGE_WINDOWS, "hi")?.voice.name).toMatch(/Natural\) - Hindi/);
    expect(voicePlan(EDGE_WINDOWS, "kn")).toMatchObject({ borrowed: false, voice: { lang: "kn-IN" } });
  });
  it("prefers Google's network Hindi voice to the local one", () => {
    expect(voicePlan(CHROME_WINDOWS, "hi")?.voice.name).toBe("Google हिन्दी");
  });
  it("lets a Hindi voice read Kannada when there is no Kannada voice, never an English one", () => {
    expect(voicePlan(CHROME_WINDOWS, "kn")).toMatchObject({ borrowed: true, voice: { lang: "hi-IN" } });
    expect(voicePlan(CHROME_WINDOWS.filter((x) => !x.lang.startsWith("hi")), "kn")).toBeNull();
  });
  it("handles Android's underscore language tags", () => {
    expect(voicePlan(ANDROID, "kn")).toMatchObject({ borrowed: false, voice: { name: "Kannada India" } });
  });
  it("knows which voices are female or male", () => {
    expect(genderOf(v("Microsoft Ravi - English (India)", "en-IN"))).toBe("male");
    expect(genderOf(v("Google UK English Female", "en-GB"))).toBe("female");
    expect(genderOf(v("Google UK English Male", "en-GB"))).toBe("male");
    expect(genderOf(v("Microsoft Sapna Online (Natural) - Kannada (India)", "kn-IN"))).toBe("female");
    expect(genderOf(v("Microsoft Gagan Online (Natural) - Kannada (India)", "kn-IN"))).toBe("male");
    expect(genderOf(v("Kannada India", "kn-IN"))).toBeNull();
  });
});
