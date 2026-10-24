// GET /api/auth/google/callback — where Google sends the browser back.
// A known member is signed in and sent to their home. Someone new is sent to
// /login to choose buying or selling, with their Google name and email carried
// along in a short-lived signed cookie.
import { NextResponse, type NextRequest } from "next/server";
import { consumeState, fetchGoogleProfile, findGoogleMember, googleConfigured, googleRedirectUri, setPendingGoogle } from "@/lib/auth/google";
import { startSession } from "@/lib/auth/session";
import { ROLE_HOME, type Role } from "@/lib/auth/token";

/** Finishes Google sign-in. */
export async function GET(req: NextRequest) {
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
  if (!googleConfigured()) return fail("google_not_configured");
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail(params.get("error") === "access_denied" ? "google_cancelled" : "google_failed");
  const saved = await consumeState(params.get("state"));
  const code = params.get("code");
  if (!saved || !code) return fail("google_failed");
  try {
    const profile = await fetchGoogleProfile(code, googleRedirectUri(req.nextUrl.origin));
    const member = await findGoogleMember(profile);
    if (member) {
      if (member.suspended) return fail("suspended");
      await startSession({ id: member.id, role: member.role as Role, name: member.name });
      const home = ROLE_HOME[member.role as Role];
      return NextResponse.redirect(new URL(saved.next?.startsWith(home) ? saved.next : home, req.url));
    }
    await setPendingGoogle(profile);
    return NextResponse.redirect(new URL("/login?google=1", req.url));
  } catch (e) {
    console.warn("[google] sign-in failed:", (e as Error).message);
    return fail("google_failed");
  }
}
