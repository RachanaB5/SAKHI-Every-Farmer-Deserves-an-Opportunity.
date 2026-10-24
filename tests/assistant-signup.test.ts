// Sign-up guide: answers spoken in English, Hindi and Kannada become the
// right form values, and guide commands never swallow an ordinary answer.
import { describe, expect, it } from "vitest";
import { cleanAnswer, findCrops, guideCommand, matchVillage, mobileFrom, sellCategory, spokenDigits } from "@/lib/assistant/signup";

describe("spoken digits", () => {
  it.each([
    ["98765 43210", "9876543210"],
    ["+91 98765-43210", "919876543210"],
    ["nine eight seven six five four three two one zero", "9876543210"],
    ["nine eight double seven six five triple four", "987765444"],
    ["ninety eight seventy six fifty four thirty two ten", "9876543210"],
    ["नौ आठ सात छह पाँच चार तीन दो एक शून्य", "9876543210"],
    ["ಒಂಬತ್ತು ಎಂಟು ಏಳು ಆರು ಐದು ನಾಲ್ಕು ಮೂರು ಎರಡು ಒಂದು ಸೊನ್ನೆ", "9876543210"],
    ["೯೮೭೬೫ ೪೩೨೧೦", "9876543210"],
    ["५६१ २०३", "561203"],
    ["my number is nine eight oh oh", "9800"],
  ])("%s → %s", (said, digits) => {
    expect(spokenDigits(said)).toBe(digits);
  });

  it("accepts only a valid 10-digit mobile number", () => {
    expect(mobileFrom("9876543210")).toBe("9876543210");
    expect(mobileFrom("919876543210")).toBe("9876543210");
    expect(mobileFrom("09876543210")).toBe("9876543210");
    expect(mobileFrom("987654321")).toBeNull();
    expect(mobileFrom("1234567890")).toBeNull();
  });
});

describe("names and places", () => {
  it.each([
    ["My name is ramesh gowda.", "name", "Ramesh Gowda"],
    ["I'm Lakshmi", "name", "Lakshmi"],
    ["मेरा नाम रमेश है", "name", "रमेश"],
    ["मैं सुनीता हूँ", "name", "सुनीता"],
    ["mera naam ramesh hai", "name", "Ramesh"],
    ["ನನ್ನ ಹೆಸರು ರಮೇಶ್", "name", "ರಮೇಶ್"],
    ["it's called green valley farm", "farm", "Green Valley Farm"],
    ["ನನ್ನ ತೋಟದ ಹೆಸರು ಹಸಿರು ತೋಟ", "farm", "ಹಸಿರು ತೋಟ"],
    ["Bangalore Rural district", "place", "Bangalore Rural"],
    ["ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ ಜಿಲ್ಲೆಯಲ್ಲಿ", "place", "ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ"],
    ["रामनगर में", "place", "रामनगर"],
  ] as const)("%s → %s", (said, kind, value) => {
    expect(cleanAnswer(said, kind)).toBe(value);
  });

  it("finds pilot villages in any script with their nearest service area", () => {
    expect(matchVillage("I'm from Doddaballapur")).toEqual({ village: "Doddaballapur", area: "Yelahanka", district: "Bengaluru Rural", pin: "561203" });
    expect(matchVillage("ದೊಡ್ಡಬಳ್ಳಾಪುರದಲ್ಲಿ")).toMatchObject({ village: "Doddaballapur", area: "Yelahanka" });
    expect(matchVillage("होसकोटे")).toMatchObject({ village: "Hoskote", area: "Hebbal" });
    expect(matchVillage("kanaka pura")).toEqual({ village: "Kanakapura", area: "Jayanagar", pin: "562117" });
    expect(matchVillage("Mysuru")).toBeNull();
  });
});

describe("crops", () => {
  it.each([
    ["tomato, onion and potato", ["tomato", "onion", "potato"]],
    ["tomatoes and onions", ["tomato", "onion"]],
    ["ಟೊಮೇಟೊ ಮತ್ತು ಈರುಳ್ಳಿ", ["tomato", "onion"]],
    ["टमाटर, प्याज़ और पालक", ["tomato", "onion", "spinach"]],
    ["milk and eggs", ["milk", "eggs"]],
    ["patta gobhi aur gajar", ["cabbage", "carrot"]],
    ["nothing really", []],
  ])("%s", (said, crops) => {
    expect(findCrops(said)).toEqual(crops);
  });

  it("maps crops to the sign-up categories", () => {
    expect(sellCategory("spinach")).toBe("leafy");
    expect(sellCategory("chicken")).toBe("meat");
  });
});

describe("guide commands", () => {
  it.each([
    ["Next", "next"],
    ["okay next", "next"],
    ["ಮುಂದೆ", "next"],
    ["आगे", "next"],
    ["go back", "back"],
    ["ಹಿಂದೆ", "back"],
    ["फिर से", "repeat"],
    ["ಮತ್ತೊಮ್ಮೆ", "repeat"],
    ["skip", "skip"],
    ["बाद में", "skip"],
  ])("%s → %s", (said, cmd) => {
    expect(guideCommand(said)).toBe(cmd);
  });

  it("leaves real answers alone", () => {
    for (const said of ["Ramesh", "next to the temple", "back road, Hoskote", "ನಮ್ಮ ಊರು ಹೊಸಕೋಟೆ"]) expect(guideCommand(said)).toBeNull();
  });
});
