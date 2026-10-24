// Sakhi's Hindi voice: numbers as Hindi words, English words in Devanagari,
// natural device voices preferred, and (when the model is installed) real speech.
import { describe, expect, it } from "vitest";
import { hindiNumber, hindiNumbersToWords } from "@/lib/assistant/hindi-speech";
import { rankVoices } from "@/lib/assistant/tts";
import { hindiVoiceAvailable, prepareHindi, synthesizeHindi } from "@/lib/tts/hindi";

describe("Hindi numbers for the voice", () => {
  it.each([
    [0, "शून्य"],
    [25, "पच्चीस"],
    [250, "दो सौ पचास"],
    [2500, "दो हज़ार पाँच सौ"],
    [125000, "एक लाख पच्चीस हज़ार"],
    [12500000, "एक करोड़ पच्चीस लाख"],
    [1.5, "डेढ़"],
    [2.5, "ढाई"],
    [3.5, "साढ़े तीन"],
  ])("%s → %s", (n, words) => {
    expect(hindiNumber(n)).toBe(words);
  });

  it("rewrites numbers inside a sentence, ignoring Indian grouping commas", () => {
    expect(hindiNumbersToWords("कुल 1,250 रुपये")).toBe("कुल एक हज़ार दो सौ पचास रुपये");
  });
});

describe("text for the Hindi model", () => {
  it("keeps Hindi words as they are and writes English in Devanagari", () => {
    expect(prepareHindi("नमस्ते Ramesh, FoodFlow पर आपका स्वागत है।")).toBe("नमस्ते रमेश, फ़ूडफ़्लो पर आपका स्वागत है।");
    expect(prepareHindi("आपकी UPI ID जोड़ें")).toBe("आपकी यूपीआई आईडी जोड़ें");
  });

  it("leaves no Latin letters or digits", () => {
    const text = prepareHindi("50 किलो टमाटर, 25 रुपये किलो। O T P बताइए। (FF-7K2QA)");
    expect(text).not.toMatch(/[A-Za-z0-9()]/);
    expect(text).toContain("पचास किलो टमाटर");
  });
});

describe("device voice choice", () => {
  const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService, voiceURI: name, default: false }) as SpeechSynthesisVoice;

  it("prefers a natural voice to a robotic Indian-English one, and natural Indian English most", () => {
    const robotic = voice("Microsoft Heera - English (India)", "en-IN");
    const naturalUs = voice("Microsoft Aria Online (Natural) - English (United States)", "en-US", false);
    const naturalIn = voice("Microsoft Neerja Online (Natural) - English (India)", "en-IN", false);
    expect(rankVoices([robotic, naturalUs], "en")[0]).toBe(naturalUs);
    expect(rankVoices([robotic, naturalUs, naturalIn], "en")[0]).toBe(naturalIn);
  });

  it("ranks a natural Hindi voice above a desktop one", () => {
    const desktop = voice("Microsoft Kalpana Desktop - Hindi", "hi-IN");
    const natural = voice("Microsoft Swara Online (Natural) - Hindi (India)", "hi-IN", false);
    expect(rankVoices([desktop, natural], "hi")[0]).toBe(natural);
  });
});

describe.runIf(hindiVoiceAvailable())("speech (model installed)", () => {
  it("speaks a Hindi sentence as a WAV of sensible length", async () => {
    const wav = await synthesizeHindi("नमस्ते, मैं सखी हूँ।");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(22050);
    const seconds = wav.readUInt32LE(40) / 2 / 22050;
    expect(seconds).toBeGreaterThan(0.6);
    expect(seconds).toBeLessThan(6);
  }, 60_000);
});
