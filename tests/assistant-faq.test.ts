// Sakhi beyond the script: questions about FoodFlow in three languages get
// answers (and never become sign-up answers), everyday answers aren't taken
// for questions, shortcuts and near misses pick the right choice, more ways
// of saying yes and no are understood, and the farmer app answers questions
// it has no action for.
import { beforeAll, describe, expect, it } from "vitest";
import { handleIntent } from "@/lib/assistant/actions";
import { matchFaq, WHY_ANSWERS, whyAbout, whyKind } from "@/lib/assistant/faq";
import { yesNo } from "@/lib/assistant/lexicon";
import { parseUtterance } from "@/lib/assistant/parse";
import { matchMany, matchOne } from "@/lib/assistant/signup-script";
import { makeUser } from "./helpers";

describe("questions about FoodFlow", () => {
  it.each([
    ["what is this app?", "about"],
    ["What is FoodFlow", "about"],
    ["ಈ ಆಪ್ ಏನು?", "about"],
    ["ಇದು ಏನು", "about"],
    ["यह ऐप क्या है?", "about"],
    ["who are you", "sakhi"],
    ["ನೀನು ಯಾರು", "sakhi"],
    ["आप कौन हो", "sakhi"],
    ["is it free?", "cost"],
    ["how much commission do you take", "cost"],
    ["ಇದು ಉಚಿತವಾ?", "cost"],
    ["कितना कमीशन लगेगा", "cost"],
    ["when will I get paid", "payout"],
    ["ಹಣ ಯಾವಾಗ ಬರುತ್ತದೆ", "payout"],
    ["पैसे कब मिलेंगे", "payout"],
    ["is my data safe?", "privacy"],
    ["how does delivery work", "delivery"],
    ["how do I sell my tomatoes", "howSell"],
    ["which areas do you serve", "areas"],
    ["do I need aadhaar?", "documents"],
    ["what are the options", "options"],
    ["help", "help"],
    ["ಅರ್ಥ ಆಗಲಿಲ್ಲ", "help"],
    ["why do you need my number", "why"],
    ["ನಮಸ್ಕಾರ", "greet"],
    ["thank you", "thanks"],
  ] as const)("%s → %s", (said, topic) => {
    expect(matchFaq(said, { answering: true })?.topic).toBe(topic);
  });

  it.each(["Ramesh Gowda", "online through FoodFlow", "I deliver myself", "ನನ್ನ ಸ್ವಂತ ಜಮೀನು", "बैंक और नकद", "Doddaballapur", "50 kilo a week", "yes", "Gowda Natural Farm"])(
    "an answer is not a question: %s",
    (said) => {
      expect(matchFaq(said, { answering: true })).toBeNull();
    },
  );

  it("every answer exists in all three languages", () => {
    for (const said of ["what is this app", "who are you", "is it free", "when will I get paid", "is my data safe", "how does delivery work"]) {
      const hit = matchFaq(said)!;
      for (const l of ["en", "kn", "hi"] as const) expect(hit.answer[l].length).toBeGreaterThan(20);
    }
    for (const a of Object.values(WHY_ANSWERS)) for (const l of ["en", "kn", "hi"] as const) expect(a[l].length).toBeGreaterThan(20);
  });

  it("explains why the detail being asked is needed", () => {
    expect(whyAbout("why do you need my address")).toBe("place");
    expect(whyAbout("ನಂಬರ್ ಯಾಕೆ ಬೇಕು")).toBe("phone");
    expect(whyKind("pincode")).toBe("place");
    expect(whyKind("paymentMethods")).toBe("payment");
    expect(whyKind("agreeTerms")).toBe("consent");
  });
});

describe("shortcuts and near misses", () => {
  it.each([
    ["buyerTypes", "resturants", ["RESTAURANTS"]],
    ["buyerTypes", "apartmnts", ["COMMUNITIES"]],
    ["fulfilment", "they pick it up, or FoodFlow delivers", ["PICKUP", "FOODFLOW_DELIVERY"]],
    ["orderSizes", "ಸಣ್ಣ", ["SMALL"]],
    ["paymentMethods", "gpay and cash", ["UPI", "CASH"]],
  ] as const)("%s: %s", (field, said, values) => {
    expect(matchMany(field, said)).toEqual(values);
  });

  it.each([
    ["availability", "the 2nd one", "WEEKLY"],
    ["availability", "option 3", "SEASONAL"],
    ["sellerType", "pehla", "INDIVIDUAL"],
    ["entityType", "partnrship", "PARTNERSHIP"],
    ["orderSizes", "large ones", "BULK"],
    ["orderSizes", "medum", "MEDIUM"],
  ] as const)("%s: %s", (field, said, value) => {
    expect(matchOne(field, said)).toBe(value);
  });

  it("a shared word picks nothing on its own", () => {
    expect(matchMany("orderSizes", "ಆರ್ಡರ್")).toEqual([]);
  });
});

describe("yes and no", () => {
  it.each(["of course", "yup", "ಆಯ್ತು", "ಹೂಂ", "ಖಂಡಿತ", "हाँ जी", "बिल्कुल", "ji haan", "i agree"])("yes: %s", (said) => expect(yesNo(said)).toBe("yes"));
  it.each(["not now", "nah", "ಬೇಡಾ", "ಈಗ ಬೇಡ", "अभी नहीं", "that's not right", "cancel ಮಾಡಿ"])("no: %s", (said) => expect(yesNo(said)).toBe("no"));
});

describe("Sakhi in the farmer app", () => {
  let farmer: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    farmer = await makeUser("FARMER");
  });

  it.each([
    ["what is this app", "en", "FoodFlow connects farmers"],
    ["ಈ ಆಪ್ ಏನು", "kn", "FoodFlow ರೈತರನ್ನು"],
    ["क्या यह मुफ़्त है", "hi", "मुफ़्त है"],
  ] as const)("answers %s instead of saying it can't", async (said, lang, expected) => {
    const r = await handleIntent(farmer, parseUtterance(said), lang, undefined, said);
    expect(r.ok).toBe(true);
    expect(r.speech).toContain(expected);
  });

  it("still runs actions it recognises", async () => {
    const r = await handleIntent(farmer, parseUtterance("my earnings this week"), "en", undefined, "my earnings this week");
    expect(r.intent).toBe("CHECK_EARNINGS");
  });
});
