// Zod schemas for the auth API (login, register, phone codes, PIN reset, demo persona switch).
import { z } from "zod";
import { phoneSchema, pinSchema, roleSchema, langSchema } from "./common";

export const loginSchema = z.object({ phone: phoneSchema, pin: pinSchema });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(80),
    phone: phoneSchema,
    /** Optional only when a Google profile is attached (the route enforces this). */
    pin: pinSchema.optional(),
    role: z.enum(["FARMER", "CONSUMER", "BULK_BUYER"]),
    area: z.string().min(2).max(60),
    language: langSchema.default("en"),
    orgName: z.string().trim().max(80).optional(),
    orgType: z.enum(["RESTAURANT", "HOSTEL", "COMMUNITY_KITCHEN"]).optional(),
    village: z.string().trim().max(60).optional(),
    farmName: z.string().trim().max(80).optional(),
    /** Delivery address typed at sign-up; becomes the first saved address. */
    address: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.role !== "BULK_BUYER" || (v.orgName && v.orgType), {
    message: "Organisation name and type are required for bulk buyers",
    path: ["orgName"],
  })
  .refine((v) => v.role !== "FARMER" || v.village, {
    message: "Village is required for farmers",
    path: ["village"],
  });

export const codePurposeSchema = z.enum(["SIGNUP", "RESET"]);

export const phoneCodeRequestSchema = z.object({ phone: phoneSchema, purpose: codePurposeSchema });
export const phoneCodeCheckSchema = z.object({ phone: phoneSchema, purpose: codePurposeSchema, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });
export const resetPinSchema = z.object({ phone: phoneSchema, pin: pinSchema });

export type PhoneCodeRequest = z.infer<typeof phoneCodeRequestSchema>;
export type PhoneCodeCheck = z.infer<typeof phoneCodeCheckSchema>;
export type ResetPinInput = z.infer<typeof resetPinSchema>;

export const demoLoginSchema = z.object({
  role: roleSchema.optional(),
  userId: z.string().min(1).max(64).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
