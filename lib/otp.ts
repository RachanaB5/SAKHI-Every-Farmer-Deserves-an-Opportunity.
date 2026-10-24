// Handover OTPs (doorstep delivery and self-pickup).
//
//   • 6 digits from a CSPRNG, generated server-side
//   • stored ONLY as HMAC-SHA256(secret, deliveryId:nonce:otp) — never in plain text
//   • expire after 15 minutes; at most 5 attempts per code
//   • the recipient can regenerate (new nonce → old code and old QR die)
//   • single use: cleared once the handover is verified
import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { secretKey } from "@/lib/auth/token";

export const OTP_TTL_MS = 15 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_REGENERATIONS = 10;

/** Uniform 6-digit code (leading zeros kept). */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Keyed hash so a leaked DB row can't be brute-forced offline. */
export function hashOtp(otp: string, deliveryId: string, nonce: string): string {
  return createHmac("sha256", Buffer.from(secretKey())).update(`${deliveryId}:${nonce}:${otp}`).digest("hex");
}

/** Constant-time comparison of a candidate OTP against the stored hash. */
export function otpMatches(otp: string, d: { id: string; otpNonce: string | null; otpHash: string | null }): boolean {
  if (!d.otpHash || !d.otpNonce || !/^\d{6}$/.test(otp)) return false;
  const a = Buffer.from(hashOtp(otp, d.id, d.otpNonce), "hex");
  const b = Buffer.from(d.otpHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Issues (or re-issues) the handover OTP for a delivery. Resets the attempt
 * counter and rotates the nonce, invalidating any previous code/QR.
 * @returns the plaintext OTP — return it ONLY to the recipient
 */
export async function issueOtp(deliveryId: string): Promise<{ otp: string; expiresAt: Date; nonce: string }> {
  const d = await db.delivery.findUnique({ where: { id: deliveryId }, select: { otpRegenerations: true } });
  if (!d) throw new HttpError(404, "Delivery not found");
  if (d.otpRegenerations >= OTP_MAX_REGENERATIONS) throw new HttpError(429, "Too many new codes, contact support");
  const otp = generateOtp();
  const nonce = randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await db.delivery.update({
    where: { id: deliveryId },
    data: { otpHash: hashOtp(otp, deliveryId, nonce), otpNonce: nonce, otpExpiresAt: expiresAt, otpAttempts: 0, otpRegenerations: { increment: 1 } },
  });
  return { otp, expiresAt, nonce };
}

/** Signed pickup QR payload — bound to the current OTP nonce. */
export async function signPickupToken(orderId: string, nonce: string, expiresAt: Date): Promise<string> {
  return new SignJWT({ purpose: "pickup", n: nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(orderId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());
}

/**
 * Verifies a pickup QR token.
 * @returns { orderId, nonce } or null when invalid/expired/tampered
 */
export async function readPickupToken(token: string): Promise<{ orderId: string; nonce: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.purpose !== "pickup" || !payload.sub || typeof payload.n !== "string") return null;
    return { orderId: payload.sub, nonce: payload.n };
  } catch {
    return null;
  }
}
