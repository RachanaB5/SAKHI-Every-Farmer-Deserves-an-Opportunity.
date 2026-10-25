// Request schemas for the Sakhi API.
import { z } from "zod";
import { CONFIRM_INTENTS, contextSchema, entitiesSchema } from "@/lib/assistant/intents";

export const assistantLangSchema = z.enum(["en", "hi", "kn"]);

export const interpretSchema = z.object({
  text: z.string().trim().min(1, "Say or type something first").max(500),
  lang: assistantLangSchema,
  /** Reply in English even when listening in another language (no local voice). */
  replyLang: assistantLangSchema.optional(),
  sttConfidence: z.number().min(0).max(1).optional(),
  context: contextSchema.optional(),
});

export const prepareSchema = z.object({
  intent: z.enum(CONFIRM_INTENTS),
  entities: entitiesSchema,
  lang: assistantLangSchema,
  context: contextSchema.optional(),
});

export const confirmSchema = z.object({ token: z.string().min(20).max(4000) });

export const assistantSettingsSchema = z
  .object({ welcomeSeen: z.boolean().optional(), autoVoice: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to change" });

export type InterpretInput = z.infer<typeof interpretSchema>;
export type PrepareInput = z.infer<typeof prepareSchema>;
export type ConfirmInput = z.infer<typeof confirmSchema>;
export type AssistantSettingsInput = z.infer<typeof assistantSettingsSchema>;
