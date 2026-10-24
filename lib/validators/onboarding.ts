// Validation for seller and restaurant onboarding and the contact form.
// Preferences only: bank details are never accepted here (payouts go through
// a payment provider's own secure setup).
import { z } from "zod";
import { CROP_SLUGS } from "@/lib/crops";
import {
  ALLOCATION, AVAILABILITY, BUYER_TYPES, BULK_PRICING, CAPACITY, DELIVERY_FEE, ENTITY_TYPES, FULFILMENT, ORDER_SIZES,
  ORG_TYPES, OWNERSHIP, PACKING, PAYMENT_METHODS, PAYOUT, PRICING, PRODUCT_CATEGORIES, RADIUS, SELLER_TYPES, SHORTAGE,
  STORAGE, SUPPLY_SOURCE, VEHICLE, WEEKLY_NEED, values,
} from "@/lib/onboarding-options";
import { langSchema, phoneSchema, pinSchema } from "./common";

const text = (min: number, max: number, what = "This") => z.string().trim().min(min, `${what} is required`).max(max);
const pincode = z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit PIN code");

/** Everything the seller wizard collects, plus the account credentials. */
export const sellerOnboardingSchema = z.object({
  // 1 · who
  sellerType: z.enum(values(SELLER_TYPES)),
  businessName: text(2, 80, "Farm or business name"),
  contactName: text(2, 80, "Contact name"),
  phone: phoneSchema,
  language: langSchema,
  state: text(2, 60, "State"),
  district: text(2, 60, "District"),
  village: text(2, 60, "Town or village"),
  pincode,
  addressLine: text(4, 200, "Address"),
  /** The pilot service area closest to them (decides who can order from them). */
  area: text(2, 60, "Nearest service area"),
  ownership: z.enum(values(OWNERSHIP)),
  // 2 · what and how much
  categories: z.array(z.enum(values(PRODUCT_CATEGORIES))).min(1, "Pick at least one kind of produce"),
  crops: z.array(z.enum(CROP_SLUGS)).default([]),
  source: z.enum(values(SUPPLY_SOURCE)),
  capacity: z.enum(values(CAPACITY)),
  availability: z.enum(values(AVAILABILITY)),
  storage: z.array(z.enum(values(STORAGE))).default([]),
  // 3 · who to sell to
  buyerTypes: z.array(z.enum(values(BUYER_TYPES))).min(1, "Pick at least one kind of buyer"),
  orderSizes: z.enum(values(ORDER_SIZES)),
  allocation: z.enum(values(ALLOCATION)),
  minOrderKg: z.coerce.number().min(0).max(100_000).optional(),
  negotiable: z.boolean().default(false),
  recurring: z.boolean().default(false),
  surplusAlerts: z.boolean().default(true),
  // 4 · fulfilment
  fulfilment: z.array(z.enum(values(FULFILMENT))).min(1, "Choose how buyers receive the produce"),
  vehicle: z.enum(values(VEHICLE)).default("NO"),
  radius: z.enum(values(RADIUS)),
  deliveryFee: z.enum(values(DELIVERY_FEE)),
  packing: z.enum(values(PACKING)),
  prepNoticeHours: z.coerce.number().min(0).max(240).default(12),
  // 5 · pricing + payment preferences (no bank details)
  pricing: z.enum(values(PRICING)),
  bulkPricing: z.enum(values(BULK_PRICING)),
  advanceOrders: z.boolean().default(false),
  shortage: z.enum(values(SHORTAGE)),
  paymentMethods: z.array(z.enum(values(PAYMENT_METHODS))).min(1, "Choose at least one way to be paid"),
  payoutPreference: z.enum(values(PAYOUT)),
  // 6 · verification
  entityType: z.enum(values(ENTITY_TYPES)),
  fssaiNumber: z.string().trim().max(20).optional(),
  fssaiExpiry: z.string().trim().max(10).optional(),
  authorised: z.literal(true, { error: "Please confirm you are allowed to sell this produce" }),
  accurate: z.literal(true, { error: "Please agree to keep availability accurate" }),
  agreeTerms: z.literal(true, { error: "Please accept the seller terms and privacy policy" }),
  // account: optional only when a Google profile is attached (the route enforces this)
  pin: pinSchema.optional(),
});
export type SellerOnboarding = z.infer<typeof sellerOnboardingSchema>;

/** Restaurant / hostel / community kitchen sign-up. */
export const restaurantOnboardingSchema = z.object({
  orgName: text(2, 80, "Business name"),
  orgType: z.enum(values(ORG_TYPES)),
  contactName: text(2, 80, "Contact person"),
  phone: phoneSchema,
  pin: pinSchema.optional(),
  language: langSchema.default("en"),
  addressLine: text(6, 200, "Address"),
  area: text(2, 60, "Area"),
  pincode,
  fssaiNumber: z.string().trim().max(20).optional(),
  gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9A-Z]{15}$/, "GSTIN has 15 characters").optional(),
  weeklyNeed: z.enum(values(WEEKLY_NEED)).optional(),
  agreeTerms: z.literal(true, { error: "Please accept the terms and privacy policy" }),
});
export type RestaurantOnboarding = z.infer<typeof restaurantOnboardingSchema>;

export const contactSchema = z
  .object({
    name: text(2, 80, "Your name"),
    email: z.string().trim().max(120).email("Enter a valid email").optional().or(z.literal("")),
    phone: z.string().trim().max(20).optional().or(z.literal("")),
    topic: z.enum(["FARMER", "RESTAURANT", "HOUSEHOLD", "PARTNERSHIP", "OTHER"]),
    message: text(10, 1000, "Message"),
  })
  .refine((v) => v.email || v.phone, { message: "Add an email or phone number so we can reply", path: ["email"] });
export type ContactInput = z.infer<typeof contactSchema>;

export const addressSchema = z.object({
  label: z.enum(["Home", "Work", "Farm", "Kitchen", "Other", "Current location"]).default("Home"),
  line: text(3, 200, "Address"),
  area: z.string().trim().max(60).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  isCurrentLocation: z.boolean().default(false),
  makeActive: z.boolean().default(true),
});
export type AddressInput = z.infer<typeof addressSchema>;
