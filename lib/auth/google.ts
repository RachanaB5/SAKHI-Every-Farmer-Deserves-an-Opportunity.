// Sign in with Google (OAuth 2.0 authorisation-code flow, no SDK).
//   /api/auth/google            sends the browser to Google (state kept in a signed cookie)
//   /api/auth/google/callback   exchanges the code and either signs an existing member in
//                               or remembers the Google profile so the buy / sell sign-up
//                               can finish creating the account (phone number still needed).
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; without them the button explains it isn't set up.
import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { secretKey } from "@/lib/auth/token";

const STATE_COOKIE = "ff_google_state";
const PENDING_COOKIE = "ff_google_pending";
const STATE_TTL = 10 * 60;
const PENDING_TTL = 30 * 60;

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

/** True when the Google client credentials are present. */
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The callback URL registered with Google for this deployment. */
export const googleRedirectUri = (origin: string) => `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "")}/api/auth/google/callback`;

/** Only same-site relative paths may be used as a post-login destination. */
export const safeNext = (next?: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : undefined);

/** Google's consent-screen URL. */
export function googleAuthUrl(state: string, redirectUri: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/**
 * Trades the authorisation code for the person's Google profile.
 * @throws when Google refuses the code or the email isn't verified
 */
export async function fetchGoogleProfile(code: string, redirectUri: string): Promise<GoogleProfile> {
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!token.ok) throw new Error(`Google token exchange failed (${token.status})`);
  const { access_token } = (await token.json()) as { access_token?: string };
  if (!access_token) throw new Error("Google returned no access token");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000) });
  if (!info.ok) throw new Error(`Google profile lookup failed (${info.status})`);
  const p = (await info.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
  if (!p.sub || !p.email) throw new Error("Google profile is missing an email");
  if (p.email_verified === false) throw new Error("Google email is not verified");
  return { sub: p.sub, email: p.email.toLowerCase(), name: p.name?.trim() || p.email.split("@")[0] };
}

const sign = (claims: Record<string, unknown>, ttl: number) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${ttl}s`).sign(secretKey());
const verify = async (token?: string) => {
  if (!token) return null;
  try {
    return (await jwtVerify(token, secretKey(), { algorithms: ["HS256"] })).payload;
  } catch {
    return null;
  }
};
const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

/** Starts a sign-in: remembers a random state (and where to go afterwards) in a signed cookie. */
export async function beginState(next?: string): Promise<string> {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set(STATE_COOKIE, await sign({ state, next: safeNext(next) ?? null }, STATE_TTL), cookieOpts(STATE_TTL));
  return state;
}

/** Checks the `state` Google sent back against the cookie; returns the saved destination or false. */
export async function consumeState(state: string | null): Promise<{ next?: string } | false> {
  const store = await cookies();
  const payload = await verify(store.get(STATE_COOKIE)?.value);
  store.delete(STATE_COOKIE);
  if (!payload || !state || payload.state !== state) return false;
  return { next: typeof payload.next === "string" ? payload.next : undefined };
}

/** Remembers a verified Google profile for the sign-up screens (a signed cookie, 30 minutes). */
export async function setPendingGoogle(profile: GoogleProfile) {
  (await cookies()).set(PENDING_COOKIE, await sign({ ...profile }, PENDING_TTL), cookieOpts(PENDING_TTL));
}

/** The Google profile waiting to be attached to a new account, if any. */
export async function getPendingGoogle(): Promise<GoogleProfile | null> {
  const p = await verify((await cookies()).get(PENDING_COOKIE)?.value);
  if (!p || typeof p.sub !== "string" || typeof p.email !== "string") return null;
  return { sub: p.sub, email: p.email, name: typeof p.name === "string" ? p.name : "" };
}

/** Forgets the waiting Google profile. */
export async function clearPendingGoogle() {
  (await cookies()).delete(PENDING_COOKIE);
}

/**
 * Finds the member a Google profile belongs to: by Google id, or by the email on their account
 * (which then gets linked). Returns null for someone new.
 */
export async function findGoogleMember(profile: GoogleProfile) {
  const user = await db.user.findFirst({ where: { OR: [{ googleId: profile.sub }, { email: profile.email }] } });
  if (user && !user.googleId) return db.user.update({ where: { id: user.id }, data: { googleId: profile.sub } });
  return user;
}

/** A PIN hash nobody can guess, for accounts that only ever sign in with Google. */
export const unusablePin = () => randomBytes(24).toString("hex");
