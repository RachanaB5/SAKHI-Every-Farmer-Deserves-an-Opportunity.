// Zod schemas for every AI capability. Model output is parsed with these;
// anything that fails validation falls back to the deterministic path.
import { z } from "zod";

export const QUALITY_DISCLAIMER = "Visual assessment, not a freshness or food-safety certification";
export const PRICE_LABEL = "Indicative";

/** Visual flags a model or the heuristic may raise. */
export const QUALITY_FLAGS = [
  "bruising",
  "rot_spots",
  "mould",
  "mixed_sizes",
  "wilting",
  "minor_blemishes",
  "low_light",
  "blurry_photo",
  "overexposed",
  "not_produce",
  "not_detectable",
  "crop_mismatch",
  "crop_unconfirmed",
  "multiple_items",
  "stock_photo",
] as const;
export type QualityFlag = (typeof QUALITY_FLAGS)[number];

/** A photo check result. score / grade are null when the photos can't be graded ("not detectable"). */
export interface QualityCore {
  score: number | null;
  grade: "A" | "B" | "C" | null;
  flags: QualityFlag[];
  summary: string;
}

/** What harvest photos show, from Gemini (lib/ai/vision). */
export const photoCheckSchema = z.object({
  scene: z.enum(["single_produce", "mixed_produce", "not_produce", "unclear"]),
  /** Main item, one of the labels in the prompt, or null when unclear or mixed. */
  detected: z.string().nullable(),
  /** Whether the declared crop is clearly the main subject (null when none was declared). */
  showsDeclared: z.boolean().nullable(),
  /** A collage, advert, stock / AI image, screenshot or photo with text: not the farmer's own harvest photo. */
  stockOrCollage: z.boolean(),
  /** 0–100 visible condition of the main produce; null when it can't be judged from these photos. */
  condition: z.number().min(0).max(100).nullable(),
  flags: z.array(z.enum(QUALITY_FLAGS)).max(8),
  summary: z.string().min(5).max(300),
});
export type PhotoContentCheck = z.infer<typeof photoCheckSchema>;

export const parsedListingSchema = z.object({
  crop: z.string().nullable(),
  qty: z.number().positive().nullable(),
  unit: z.enum(["kg", "litre", "dozen"]).nullable(),
  /** ISO date YYYY-MM-DD */
  harvestDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  price: z.number().positive().nullable(),
  missing: z.array(z.enum(["crop", "qty", "unit", "harvestDate", "price"])),
});
export type ParsedListing = z.infer<typeof parsedListingSchema>;

export const parsedDemandSchema = z.object({
  crop: z.string().nullable(),
  qtyKg: z.number().positive().nullable(),
  targetPrice: z.number().positive().nullable(),
  /** ISO date-time */
  deadline: z.string().nullable(),
  urgent: z.boolean(),
  recurring: z.boolean(),
  frequency: z.enum(["DAILY", "WEEKLY"]).nullable(),
  grade: z.enum(["A", "B", "C", "ANY"]),
  missing: z.array(z.enum(["crop", "qtyKg", "targetPrice", "deadline"])),
});
export type ParsedDemand = z.infer<typeof parsedDemandSchema>;

export const groceryListSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        qty: z.number().positive().max(1000),
        unit: z.enum(["kg", "litre", "dozen", "piece"]),
      }),
    )
    .max(40),
});
export type GroceryList = z.infer<typeof groceryListSchema>;

export const priceExplanationSchema = z.object({
  basis: z.array(z.string().min(3).max(200)).min(1).max(5),
});

export const rankedOffersSchema = z.object({
  ranking: z
    .array(
      z.object({
        offerId: z.string(),
        score: z.number().min(0).max(100),
        reason: z.string().min(3).max(160),
      }),
    )
    .min(1),
});
export type RankedOffers = z.infer<typeof rankedOffersSchema>["ranking"];

export const surplusNarrativeSchema = z.object({
  reasons: z.array(z.string().min(3).max(160)).max(4),
  suggestions: z.array(z.string().min(3).max(200)).max(4),
});

/** Every AI-backed result reports where it came from so the UI can label it. */
export type AISource = "ai" | "fallback";
export interface AIResult<T> {
  data: T;
  source: AISource;
  /** Why the fallback was used (missing key, timeout, invalid JSON…). */
  note?: string;
}
