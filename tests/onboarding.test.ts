// Seller / restaurant onboarding validation, the contact form and nearest-service-area logic.
import { describe, expect, it } from "vitest";
import { nearestArea } from "@/lib/addresses";
import { contactSchema, restaurantOnboardingSchema, sellerOnboardingSchema } from "@/lib/validators/onboarding";

const seller = {
  sellerType: "INDIVIDUAL", businessName: "Gowda Natural Farm", contactName: "Ramesh Gowda", phone: "+91 98765 43210", language: "kn",
  state: "Karnataka", district: "Bengaluru Rural", village: "Doddaballapur", pincode: "561203", addressLine: "Survey 12, Tubagere Road", area: "Yelahanka", ownership: "OWN",
  categories: ["vegetables"], crops: ["tomato"], source: "SELF", capacity: "S", availability: "WEEKLY", storage: [],
  buyerTypes: ["HOUSEHOLDS"], orderSizes: "ALL", allocation: "AI_ASSIST",
  fulfilment: ["PICKUP"], vehicle: "NO", radius: "10", deliveryFee: "BUYER", packing: "SELLER",
  pricing: "BOTH", bulkPricing: "FIXED", shortage: "PARTIAL", paymentMethods: ["UPI"], payoutPreference: "LATER",
  entityType: "INDIVIDUAL", authorised: true, accurate: true, agreeTerms: true, pin: "1234",
};

describe("seller onboarding", () => {
  it("accepts a complete answer set and normalises the phone number", () => {
    const r = sellerOnboardingSchema.parse(seller);
    expect(r.phone).toBe("9876543210");
    expect(r.crops).toEqual(["tomato"]);
  });

  it("requires consent, a PIN and at least one product, buyer, fulfilment and payment choice", () => {
    for (const bad of [{ agreeTerms: false }, { pin: "12" }, { categories: [] }, { buyerTypes: [] }, { fulfilment: [] }, { paymentMethods: [] }, { pincode: "5612" }]) {
      expect(sellerOnboardingSchema.safeParse({ ...seller, ...bad }).success).toBe(false);
    }
  });

  it("never carries bank details through (unknown fields are dropped)", () => {
    const r = sellerOnboardingSchema.parse({ ...seller, accountNumber: "123456789012", ifsc: "SBIN0000001" });
    expect(r).not.toHaveProperty("accountNumber");
    expect(r).not.toHaveProperty("ifsc");
  });

  it("rejects an unknown crop", () => {
    expect(sellerOnboardingSchema.safeParse({ ...seller, crops: ["unobtainium"] }).success).toBe(false);
  });
});

describe("restaurant onboarding", () => {
  const base = { orgName: "The Green Ladle", orgType: "RESTAURANT", contactName: "Vikram Shetty", phone: "9000000301", pin: "1234", addressLine: "12 Main Road, Hebbal", area: "Hebbal", pincode: "560024", agreeTerms: true };
  it("accepts the essentials, with licence numbers optional", () => {
    expect(restaurantOnboardingSchema.safeParse(base).success).toBe(true);
    expect(restaurantOnboardingSchema.safeParse({ ...base, gstin: "29ABCDE1234F1Z5" }).success).toBe(true);
  });
  it("rejects a malformed GSTIN or missing consent", () => {
    expect(restaurantOnboardingSchema.safeParse({ ...base, gstin: "123" }).success).toBe(false);
    expect(restaurantOnboardingSchema.safeParse({ ...base, agreeTerms: false }).success).toBe(false);
  });
});

describe("contact form", () => {
  const msg = { name: "Asha", topic: "FARMER", message: "I would like to sell my tomatoes." };
  it("needs a way to reply", () => {
    expect(contactSchema.safeParse(msg).success).toBe(false);
    expect(contactSchema.safeParse({ ...msg, email: "asha@example.com" }).success).toBe(true);
    expect(contactSchema.safeParse({ ...msg, phone: "9876543210" }).success).toBe(true);
  });
  it("rejects a too-short message", () => {
    expect(contactSchema.safeParse({ ...msg, email: "a@b.co", message: "hi" }).success).toBe(false);
  });
});

describe("phone numbers", () => {
  it("keeps a 10-digit mobile that starts with 91 and strips a real country code", () => {
    expect(sellerOnboardingSchema.shape.phone.parse("9123456789")).toBe("9123456789");
    expect(sellerOnboardingSchema.shape.phone.parse("+91 91234 56789")).toBe("9123456789");
    expect(sellerOnboardingSchema.shape.phone.parse("919123456789")).toBe("9123456789");
  });
});

describe("nearestArea", () => {
  it("finds the service area a point is in", () => {
    const r = nearestArea(13.1, 77.6);
    expect(r.area.name).toBe("Yelahanka");
    expect(r.inService).toBe(true);
  });
  it("flags points far from every service area", () => {
    expect(nearestArea(18.52, 73.86).inService).toBe(false); // Pune
  });
});
