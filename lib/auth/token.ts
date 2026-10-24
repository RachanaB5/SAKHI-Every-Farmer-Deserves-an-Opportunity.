// Session token signing/verification (jose, HS256). Kept free of
// next/headers so both route handlers and proxy.ts can import it.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ff_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Role = "FARMER" | "CONSUMER" | "BULK_BUYER" | "ADMIN" | "DELIVERY";

/** Claims stored in the session cookie. Small on purpose — re-read the DB for anything mutable. */
export interface SessionPayload {
  sub: string;
  role: Role;
  name: string;
}

/** Home route for each role; used after login and for wrong-role redirects. */
export const ROLE_HOME: Record<Role, string> = {
  FARMER: "/farmer",
  CONSUMER: "/shop",
  BULK_BUYER: "/bulk",
  ADMIN: "/admin",
  DELIVERY: "/delivery",
};

/**
 * Returns the HMAC key derived from SESSION_SECRET.
 * @throws when the secret is missing or too short in production
 */
export function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be at least 32 characters");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-32+");
  }
  return new TextEncoder().encode(secret);
}

/** Signs a session JWT valid for SESSION_TTL_SECONDS. */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Verifies a session JWT.
 * @returns the payload, or null for missing/expired/tampered tokens
 */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return { sub: payload.sub, role: payload.role as Role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
