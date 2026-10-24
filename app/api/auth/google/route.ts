// GET /api/auth/google?next= — sends the browser to Google's consent screen.
import { NextResponse, type NextRequest } from "next/server";
import { beginState, googleAuthUrl, googleConfigured, googleRedirectUri } from "@/lib/auth/google";

/** Redirects to Google, or back to /login with a message when Google sign-in isn't set up. */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=google_not_configured", req.url));
  const state = await beginState(req.nextUrl.searchParams.get("next") ?? undefined);
  return NextResponse.redirect(googleAuthUrl(state, googleRedirectUri(req.nextUrl.origin)));
}
