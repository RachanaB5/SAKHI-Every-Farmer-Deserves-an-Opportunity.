// Reusable Zod primitives shared by API routes and client forms.
import { z } from "zod";

/**
 * Strips spaces, dashes and a +91 / 91 country code, but only when a full 10-digit number follows it:
 * a plain 10-digit mobile that happens to start with 91 is left alone.
 */
export function normalisePhone(v: string): string {
  const s = v.trim().replace(/[\s-]/g, "");
  return /^\+?91\d{10}$/.test(s) ? s.replace(/^\+?91/, "") : s;
}

/** Indian mobile number: 10 digits starting 6–9 (spaces/dashes and +91 stripped). */
export const phoneSchema = z
  .string()
  .transform(normalisePhone)
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"));

/** Login PIN: 4–6 digits. */
export const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");

export const roleSchema = z.enum(["FARMER", "CONSUMER", "BULK_BUYER", "ADMIN", "DELIVERY"]);

export const langSchema = z.enum(["en", "hi", "kn", "ta", "te"]);

/** Positive quantity with sane upper bound (kg / litres / dozens). */
export const qtySchema = z.coerce.number().positive("Quantity must be more than 0").max(100_000);

/** Price in rupees per unit. */
export const priceSchema = z.coerce.number().positive("Price must be more than 0").max(100_000);

export const idSchema = z.string().min(1).max(64);
