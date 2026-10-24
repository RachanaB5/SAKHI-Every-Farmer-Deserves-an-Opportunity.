// Sakhi's Kannada voice: English words, names and codes inside Kannada
// lines become Kannada letters, text is cut into pieces the model can read,
// and (when the model is installed locally) real speech comes back as WAV.
import { describe, expect, it } from "vitest";
import { latinToKannada, soundOut } from "@/lib/tts/latin-kannada";
import { chunkKannada, kannadaVoiceAvailable, prepareKannada, synthesizeKannada } from "@/lib/tts/kannada";

describe("English inside Kannada lines", () => {
  it.each([
    ["ramesh", "ರಮೇಶ್"],
    ["ananya", "ಅನನ್ಯ"],
    ["sunita", "ಸುನಿತ"],
    ["anand", "ಅನಂದ್"],
    ["ashok", "ಅಶೋಕ್"],
    ["lakshmi", "ಲಕ್ಷ್ಮಿ"],
  ])("%s → %s", (word, kannada) => {
    expect(soundOut(word)).toBe(kannadaWord(kannada));
  });

  it("uses known spellings and letter names", () => {
    expect(latinToKannada("FoodFlow ಗೆ ಸ್ವಾಗತ")).toBe("ಫುಡ್ ಫ್ಲೋ ಗೆ ಸ್ವಾಗತ");
    expect(latinToKannada("F F 7 K")).toBe("ಎಫ್ ಎಫ್ 7 ಕೆ");
    expect(latinToKannada("UPI")).toBe("ಯುಪಿಐ");
    expect(latinToKannada("ನಮಸ್ಕಾರ Ramesh Gowda")).toBe("ನಮಸ್ಕಾರ ರಮೇಶ್ ಗೌಡ");
  });

  it("leaves only letters the model knows, numbers as words", () => {
    const text = prepareKannada("ನಮಸ್ಕಾರ Ramesh! 50 ಕಿಲೋ (FF-7K2QA)");
    expect(text).not.toMatch(/[A-Za-z0-9()]/);
    expect(text).toContain("ಐವತ್ತು");
  });
});

describe("chunks", () => {
  it("keeps every piece under the model's limit, breaking at sentences and commas first", () => {
    const long = "ನಿಮ್ಮ ಬೆಳೆಯನ್ನು ಪಟ್ಟಿ ಮಾಡಲು ಪ್ಲಸ್ ಬಟನ್ ಒತ್ತಿ, ಅಥವಾ ನನಗೆ ಹೇಳಿ. ".repeat(6);
    const pieces = chunkKannada(long);
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(110);
    expect(pieces.join(" ").replace(/\s+/g, "")).toBe(long.replace(/\s+/g, ""));
  });

  it("leaves a short line whole", () => {
    expect(chunkKannada("ನಮಸ್ಕಾರ, ನಾನು ಸಖಿ.")).toEqual(["ನಮಸ್ಕಾರ, ನಾನು ಸಖಿ."]);
  });
});

describe.runIf(kannadaVoiceAvailable())("speech (model installed)", () => {
  it("speaks a Kannada sentence as a WAV of sensible length", async () => {
    const wav = await synthesizeKannada("ನಮಸ್ಕಾರ, ನಾನು ಸಖಿ.");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(22050);
    const seconds = wav.readUInt32LE(40) / 2 / 22050;
    expect(seconds).toBeGreaterThan(0.8);
    expect(seconds).toBeLessThan(6);
  }, 60_000);
});

/** Normalises the expected spelling the same way the code writes it. */
function kannadaWord(s: string) {
  return s.normalize("NFC");
}
