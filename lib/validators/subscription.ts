// Request schemas for subscription create / update.
import { z } from "zod";
import { SUBSCRIPTION_SLOTS } from "@/lib/subscription-schedule";

const schedule = {
  frequency: z.enum(["DAILY", "WEEKLY"]),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  preferredSlot: z.enum(SUBSCRIPTION_SLOTS),
};

export const createSubscriptionSchema = z
  .object({ listingId: z.string().min(1), qty: z.number().positive().max(100), ...schedule })
  .refine((v) => v.frequency === "DAILY" || v.dayOfWeek != null, { message: "Pick a day for weekly deliveries", path: ["dayOfWeek"] });

export const updateSubscriptionSchema = z
  .object({
    active: z.boolean().optional(),
    qty: z.number().positive().max(100).optional(),
    frequency: schedule.frequency.optional(),
    dayOfWeek: schedule.dayOfWeek,
    preferredSlot: schedule.preferredSlot.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" });

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
