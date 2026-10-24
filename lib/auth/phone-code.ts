// Proving a phone number with a texted code, before an account is created
// (SIGNUP) or a forgotten PIN is replaced (RESET).
//
//   • 6 digits from a CSPRNG; stored only as HMAC(secret, phone:purpose:salt:code)
//   • 10-minute expiry, 5 tries per code, single use; a new code retires the old one
//   • at most one code every 30 s and 5 an hour per number (plus a per-IP cap in the route)
//   • a correct code sets a signed, HTTP-only cookie naming the number and the
//     purpose for 20 minutes; the sign-up / reset route consumes it
import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { HttpError } from "@/lib/api";
import { secretKey } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { sendCodeSms, smsIsDemo } from "@/lib/sms";

export type CodePurpose = "SIGNUP" | "RESET";

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const RESEND_AFTER_MS = 30_000;
const CODES_PER_HOUR = 5;
const PROOF_COOKIE = "ff_phone_ok";
const PROOF_TTL_S = 20 * 60;

function hashCode(phone: string, purpose: CodePurpose, salt: string, code: string): string {
  return createHmac("sha256", Buffer.from(secretKey())).update(`${phone}:${purpose}:${salt}:${code}`).digest("hex");
}

/**
 * Creates a code and texts it.
 * @returns when the next code may be requested, and in demo mode (no SMS
 *   provider) the code itself so the screen can show it
 */
export async function sendPhoneCode(phone: string, purpose: CodePurpose): Promise<{ resendInSeconds: number; demoCode?: string }> {
  const since = new Date(Date.now() - 60 * 60_000);
  const recent = await db.phoneCode.findMany({ where: { phone, purpose, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const wait = recent[0] ? RESEND_AFTER_MS - (Date.now() - recent[0].createdAt.getTime()) : 0;
  if (wait > 0) throw new HttpError(429, `Please wait ${Math.ceil(wait / 1000)} seconds before asking for another code`);
  if (recent.length >= CODES_PER_HOUR) throw new HttpError(429, "Too many codes for this number. Please try again in an hour.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomBytes(8).toString("hex");
  // Only the newest code works.
  await db.phoneCode.updateMany({ where: { phone, purpose, usedAt: null }, data: { usedAt: new Date() } });
  const row = await db.phoneCode.create({ data: { phone, purpose, salt, codeHash: hashCode(phone, purpose, salt, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  try {
    await sendCodeSms(phone, code);
  } catch (e) {
    await db.phoneCode.delete({ where: { id: row.id } });
    throw e;
  }
  return { resendInSeconds: RESEND_AFTER_MS / 1000, ...(smsIsDemo() && { demoCode: code }) };
}

/**
 * Checks a code. Each try is counted atomically, so parallel guesses can't
 * exceed the limit.
 * @throws 400 wrong / expired code, 429 too many tries
 */
export async function checkPhoneCode(phone: string, purpose: CodePurpose, code: string): Promise<void> {
  const row = await db.phoneCode.findFirst({ where: { phone, purpose, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!row || row.expiresAt < new Date()) throw new HttpError(400, "This code has expired. Ask for a new one.");
  const counted = await db.phoneCode.updateMany({ where: { id: row.id, attempts: { lt: CODE_MAX_ATTEMPTS }, usedAt: null }, data: { attempts: { increment: 1 } } });
  if (counted.count === 0) throw new HttpError(429, "Too many wrong tries. Ask for a new code.");
  const want = Buffer.from(row.codeHash, "hex");
  const got = Buffer.from(hashCode(phone, purpose, row.salt, /^\d{6}$/.test(code) ? code : "x"), "hex");
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    const left = CODE_MAX_ATTEMPTS - row.attempts - 1;
    throw new HttpError(400, left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "That code isn't right. Ask for a new code.");
  }
  await db.phoneCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
}

/** After a correct code: remembers the proven number (signed cookie, 20 minutes). */
export async function rememberVerifiedPhone(phone: string, purpose: CodePurpose) {
  const token = await new SignJWT({ phone, purpose }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${PROOF_TTL_S}s`).sign(secretKey());
  (await cookies()).set(PROOF_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: PROOF_TTL_S });
}

/** Whether this browser proved `phone` for `purpose` in the last 20 minutes. */
export async function phoneIsVerified(phone: string, purpose: CodePurpose): Promise<boolean> {
  const token = (await cookies()).get(PROOF_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.phone === phone && payload.purpose === purpose;
  } catch {
    return false;
  }
}

/** Forgets the proof once it has been used. */
export async function clearVerifiedPhone() {
  (await cookies()).delete(PROOF_COOKIE);
}
