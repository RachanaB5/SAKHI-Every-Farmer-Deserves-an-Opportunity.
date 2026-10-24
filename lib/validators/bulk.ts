// Zod schemas for bulk procurement: demands, offers and negotiation.
import { z } from "zod";
import { CROP_SLUGS } from "@/lib/crops";
import { priceSchema } from "./common";

export const demandInput = z
  .object({
    crop: z.enum(CROP_SLUGS),
    qtyKg: z.coerce.number().positive("Quantity must be more than 0").max(100_000),
    grade: z.enum(["A", "B", "C", "ANY"]).default("ANY"),
    targetPrice: priceSchema,
    deadline: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Pick a deadline")
      .refine((v) => Date.parse(v) > Date.now() + 30 * 60_000, "Deadline must be at least 30 minutes away"),
    urgent: z.boolean().default(false),
    recurring: z.boolean().default(false),
    frequency: z.enum(["DAILY", "WEEKLY"]).nullable().optional(),
    notes: z.string().trim().max(300).optional(),
    source: z.enum(["FORM", "VOICE", "LIST"]).default("FORM"),
  })
  .refine((v) => !v.recurring || v.frequency, { message: "Choose how often this repeats", path: ["frequency"] });
export type DemandInput = z.infer<typeof demandInput>;

/** One or many demands (procurement-list mode posts several at once). */
export const createDemandsInput = z.object({ demands: z.array(demandInput).min(1).max(20) });

export const offerInput = z.object({
  listingId: z.string().min(1, "Pick which of your listings this comes from"),
  qtyKg: z.coerce.number().positive().max(100_000),
  pricePerKg: priceSchema,
  etaHours: z.coerce.number().int().min(1, "At least 1 hour").max(168, "Within a week"),
  note: z.string().trim().max(200).optional(),
});
export type OfferInput = z.infer<typeof offerInput>;

export const negotiateInput = z.object({
  action: z.enum(["COUNTER", "ACCEPT", "REJECT", "ACCEPT_COUNTER", "WITHDRAW"]),
  price: priceSchema.optional(),
});
export type NegotiateInput = z.infer<typeof negotiateInput>;
