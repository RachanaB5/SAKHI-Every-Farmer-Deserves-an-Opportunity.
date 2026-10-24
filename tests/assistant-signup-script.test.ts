// The voice sign-up script: spoken answers in three languages pick the right
// form values, and the script can never drift from what the form accepts.
import { describe, expect, it } from "vitest";
import { CHOICES, LINES, matchMany, matchOne, matchYesNo, sameAsName, SCRIPT, type DisplayField, type L3 } from "@/lib/assistant/signup-script";
import { SERVICE_AREAS } from "@/lib/areas";
import * as O from "@/lib/onboarding-options";

describe("choices match the sign-up form", () => {
  const lists: Record<DisplayField, readonly { value: string }[]> = {
    sellerType: O.SELLER_TYPES, area: SERVICE_AREAS.map((a) => ({ value: a.name })), ownership: O.OWNERSHIP, categories: O.PRODUCT_CATEGORIES,
    source: O.SUPPLY_SOURCE, capacity: O.CAPACITY, availability: O.AVAILABILITY, storage: O.STORAGE, buyerTypes: O.BUYER_TYPES,
    orderSizes: O.ORDER_SIZES, allocation: O.ALLOCATION, fulfilment: O.FULFILMENT, vehicle: O.VEHICLE, radius: O.RADIUS,
    deliveryFee: O.DELIVERY_FEE, packing: O.PACKING, pricing: O.PRICING, bulkPricing: O.BULK_PRICING, shortage: O.SHORTAGE,
    paymentMethods: O.PAYMENT_METHODS, payoutPreference: O.PAYOUT, entityType: O.ENTITY_TYPES,
  };
  it.each(Object.keys(lists) as DisplayField[])("%s offers exactly the form's values, labelled in three languages", (field) => {
    expect(CHOICES[field].map((c) => c.value)).toEqual(lists[field].map((o) => o.value));
    for (const c of CHOICES[field]) for (const l of ["en", "kn", "hi"] as const) expect(c.say[l].trim()).not.toBe("");
  });

  it("every spoken line exists in all three languages", () => {
    const l3s: L3[] = [...SCRIPT.flat().map((q) => q.ask), ...Object.values(LINES).flatMap((v) => (Array.isArray(v) ? v.slice(1) : [v]))];
    for (const l of l3s) for (const lang of ["en", "kn", "hi"] as const) expect(l[lang].trim(), JSON.stringify(l)).not.toBe("");
  });
});

describe("single choices", () => {
  it.each([
    ["sellerType", "I'm a farmer", "INDIVIDUAL"],
    ["sellerType", "ನಾನು ರೈತ", "INDIVIDUAL"],
    ["sellerType", "किसान समूह", "GROUP"],
    ["sellerType", "farmer group", "GROUP"],
    ["sellerType", "ವ್ಯಾಪಾರಿ", "AGGREGATOR"],
    ["ownership", "my own land", "OWN"],
    ["ownership", "ಗುತ್ತಿಗೆ ಜಮೀನು", "LEASE"],
    ["ownership", "किराए की ज़मीन", "LEASE"],
    ["source", "ನಾನೇ ಬೆಳೆಯುತ್ತೇನೆ", "SELF"],
    ["source", "दोनों", "MIX"],
    ["capacity", "about 200 kilo a week", "M"],
    ["capacity", "ಐವತ್ತು ಕಿಲೋ", "S"],
    ["capacity", "दो टन", "L"],
    ["capacity", "3 tonnes", "XL"],
    ["capacity", "ten kilo", "XS"],
    ["capacity", "ಗೊತ್ತಿಲ್ಲ", "VARIES"],
    ["availability", "every day", "DAILY"],
    ["availability", "ಸೀಸನ್‌ನಲ್ಲಿ ಮಾತ್ರ", "SEASONAL"],
    ["availability", "हर हफ़्ते", "WEEKLY"],
    ["orderSizes", "ಎಲ್ಲಾ", "ALL"],
    ["orderSizes", "छोटे ऑर्डर", "SMALL"],
    ["radius", "within ten kilometres", "10"],
    ["radius", "ಇಪ್ಪತ್ತು ಕಿಲೋಮೀಟರ್", "25"],
    ["radius", "कहीं भी", "WIDE"],
    ["deliveryFee", "the buyer pays", "BUYER"],
    ["deliveryFee", "ಅರ್ಧ ಅರ್ಧ", "SHARED"],
    ["deliveryFee", "मैं दूँगा", "SELLER"],
    ["packing", "ನಾನೇ ಪ್ಯಾಕ್ ಮಾಡುತ್ತೇನೆ", "SELLER"],
    ["entityType", "just me, individual", "INDIVIDUAL"],
    ["entityType", "सहकारी संस्था", "COOPERATIVE"],
    ["area", "ಹೆಬ್ಬಾಳ", "Hebbal"],
    ["sellerType", "the second one", "GROUP"],
    ["ownership", "ಮೊದಲನೆಯದು", "OWN"],
  ] as const)("%s: %s → %s", (field, said, value) => {
    expect(matchOne(field, said)).toBe(value);
  });

  it("returns null when the answer is unclear", () => {
    expect(matchOne("sellerType", "hmm let me think about it")).toBeNull();
    expect(matchOne("availability", "banana")).toBeNull();
  });
});

describe("several choices", () => {
  it.each([
    ["buyerTypes", "restaurants and shops", ["RESTAURANTS", "SHOPS"]],
    ["buyerTypes", "ಮನೆಗಳು ಮತ್ತು ಹೋಟೆಲ್‌ಗಳು", ["HOUSEHOLDS", "RESTAURANTS"]],
    ["buyerTypes", "सब", ["HOUSEHOLDS", "RESTAURANTS", "COMMUNITIES", "SHOPS", "WHOLESALERS", "INSTITUTIONS", "PROCESSORS", "MANDIS"]],
    ["fulfilment", "they pick it up, or FoodFlow delivers", ["PICKUP", "FOODFLOW_DELIVERY"]],
    ["fulfilment", "ಅವರೇ ಬಂದು ತೆಗೆದುಕೊಳ್ಳುತ್ತಾರೆ", ["PICKUP"]],
    ["paymentMethods", "UPI and cash", ["UPI", "CASH"]],
    ["paymentMethods", "ಫೋನ್ ಪೇ ಮತ್ತು ನಗದು", ["UPI", "CASH"]],
    ["paymentMethods", "बैंक और नकद", ["CASH", "BANK"]],
  ] as const)("%s: %s", (field, said, values) => {
    expect(matchMany(field, said)).toEqual(values);
  });
});

describe("yes / no and 'same as my name'", () => {
  it("understands yes and no in three languages", () => {
    for (const y of ["yes", "ಹೌದು", "हाँ", "haan", "ok"]) expect(matchYesNo(y)).toBe("yes");
    for (const n of ["no", "ಇಲ್ಲ", "नहीं"]) expect(matchYesNo(n)).toBe("no");
  });
  it("uses the farmer's own name for an unnamed farm", () => {
    for (const s of ["same", "my name", "ನನ್ನ ಹೆಸರೇ", "मेरा नाम"]) expect(sameAsName(s)).toBe(true);
    expect(sameAsName("Green Valley")).toBe(false);
  });
});
