// Server-side session helpers for route handlers and server components:
// read the signed cookie, load the current user, set/clear the cookie.
import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
  type SessionPayload,
} from "./token";

/** Returns the verified session claims from the request cookie, or null. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Loads the full user row for the current session.
 * Suspended users are treated as signed out.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user || user.suspended) return null;
  return user;
}

/**
 * Issues a session cookie for a user (HTTP-only, SameSite=Lax, Secure in prod).
 * Side effect: sets `ff_session` on the outgoing response.
 */
export async function startSession(user: { id: string; role: SessionPayload["role"]; name: string }) {
  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Clears the session cookie (logout). */
export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
