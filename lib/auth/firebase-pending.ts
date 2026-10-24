import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { secretKey } from "@/lib/auth/token";

const COOKIE = "ff_firebase_pending";
const TTL_SECONDS = 30 * 60;

export interface PendingFirebaseProfile {
  uid: string;
  email: string;
  name: string;
  providerId: string;
}

export async function setPendingFirebaseProfile(profile: PendingFirebaseProfile): Promise<void> {
  const token = await new SignJWT({ ...profile })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function getPendingFirebaseProfile(): Promise<PendingFirebaseProfile | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (
      typeof payload.uid !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.providerId !== "string"
    ) {
      return null;
    }
    return { uid: payload.uid, email: payload.email, name: payload.name, providerId: payload.providerId };
  } catch {
    return null;
  }
}

export async function getPendingJoinProfile(): Promise<{ sub: string; email: string; name: string } | null> {
  const profile = await getPendingFirebaseProfile();
  return profile ? { sub: profile.uid, email: profile.email, name: profile.name } : null;
}

export async function clearPendingFirebaseProfile(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
