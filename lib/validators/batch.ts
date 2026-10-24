// Zod schemas for harvest batches (farmer create/update/submit) and the
// AI listing/price endpoints.
import { z } from "zod";
import { CROP_SLUGS } from "@/lib/crops";
import { priceSchema, qtySchema } from "./common";

export const unitSchema = z.enum(["kg", "litre", "dozen"]);
export const gradeSchema = z.enum(["A", "B", "C"]);

/** ISO date (YYYY-MM-DD) that is not in the future and at most 10 days old. */
export const harvestDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T12:00:00`);
    const ageDays = (Date.now() - d.getTime()) / 86_400_000;
    return ageDays > -1 && ageDays <= 10;
  }, "Harvest date must be within the last 10 days");

export const batchDetailsSchema = z.object({
  crop: z.enum(CROP_SLUGS),
  quantity: qtySchema,
  unit: unitSchema,
  harvestDate: harvestDateSchema,
  price: priceSchema.optional(),
  notes: z.string().trim().max(400).optional(),
  transcript: z.string().trim().max(1000).optional(),
  inputLanguage: z.string().max(10).optional(),
});
export type BatchDetails = z.infer<typeof batchDetailsSchema>;

export const batchUpdateSchema = batchDetailsSchema.partial().extend({
  /** "submit" moves DRAFT/RESUBMIT → PENDING_REVIEW after a server-side quality check. */
  action: z.enum(["save", "submit"]).default("save"),
});

export const parseListingInput = z.object({
  transcript: z.string().trim().min(2, "Say or type something first").max(1000),
  lang: z.string().max(10).default("en-IN"),
});

export const priceAdviceInput = z.object({
  crop: z.enum(CROP_SLUGS),
  area: z.string().max(60).optional(),
  grade: z.enum(["A", "B", "C", "ANY"]).default("ANY"),
});

export type BatchUpdate = z.infer<typeof batchUpdateSchema>;
export type ParseListingInput = z.infer<typeof parseListingInput>;
export type PriceAdviceInput = z.infer<typeof priceAdviceInput>;
