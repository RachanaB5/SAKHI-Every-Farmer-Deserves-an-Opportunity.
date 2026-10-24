// Sakhi intent vocabulary: a fixed whitelist, the entity shape
// every parser (rules or model) must produce, and which intents change
// data and therefore need an explicit confirmation.
import { z } from "zod";
import { CROP_SLUGS } from "@/lib/crops";

export const INTENTS = [
  "CREATE_LISTING_DRAFT",
  "PUBLISH_LISTING",
  "UPDATE_PRICE",
  "CHECK_LISTING_PRICE",
  "CHECK_STOCK",
  "UPDATE_STOCK",
  "CHECK_EARNINGS",
  "CHECK_PAYMENT_STATUS",
  "CHECK_LISTING_STATUS",
  "LIST_BULK_DEMANDS",
  "CAN_FULFIL_DEMAND",
  "RESPOND_TO_OFFER",
  "DELIVERY_STATUS",
  "BOOK_DELIVERY",
  "HELP",
  "SMALLTALK",
  "UNSUPPORTED",
] as const;
export type Intent = (typeof INTENTS)[number];

/** Intents that change data — always answered with a confirmation card first. */
export const CONFIRM_INTENTS = ["PUBLISH_LISTING", "UPDATE_PRICE", "UPDATE_STOCK", "RESPOND_TO_OFFER", "BOOK_DELIVERY"] as const satisfies readonly Intent[];
export type ConfirmIntent = (typeof CONFIRM_INTENTS)[number];
export const needsConfirmation = (i: Intent): i is ConfirmIntent => (CONFIRM_INTENTS as readonly string[]).includes(i);

export const entitiesSchema = z
  .object({
    crop: z.enum(CROP_SLUGS).nullable(),
    qty: z.number().positive().max(100_000).nullable(),
    unit: z.enum(["kg", "litre", "dozen"]).nullable(),
    price: z.number().positive().max(100_000).nullable(),
    harvestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    period: z.enum(["today", "week", "month", "all"]).nullable(),
    orderCode: z.string().regex(/^FF-[A-Z0-9]{5}$/).nullable(),
    draftId: z.string().max(40).nullable(),
    demandId: z.string().max(40).nullable(),
  })
  .partial();
export type Entities = z.infer<typeof entitiesSchema>;

/** What every parser returns. Never touches the database. */
export const parseResultSchema = z.object({
  intent: z.enum(INTENTS),
  entities: entitiesSchema,
  confidence: z.number().min(0).max(1),
  missing: z.array(z.string()),
});
export type ParseResult = z.infer<typeof parseResultSchema>;

/** Required entities per intent; anything missing becomes a follow-up question. */
export const REQUIRED: Partial<Record<Intent, (keyof Entities)[]>> = {
  CREATE_LISTING_DRAFT: ["crop", "qty"],
  UPDATE_PRICE: ["crop", "price"],
  UPDATE_STOCK: ["crop", "qty"],
  CAN_FULFIL_DEMAND: ["crop", "qty"],
  RESPOND_TO_OFFER: ["crop", "qty", "price"],
  PUBLISH_LISTING: ["draftId"],
};

/** Conversation state the client sends back so short follow-ups ("30") make sense. */
export const contextSchema = z
  .object({
    pending: z.object({ intent: z.enum(INTENTS), entities: entitiesSchema }).nullable(),
    lastDraftId: z.string().max(40).nullable(),
    lastDemandId: z.string().max(40).nullable(),
  })
  .partial();
export type AssistantContext = z.infer<typeof contextSchema>;

export type AssistantLang = "en" | "hi" | "kn";
