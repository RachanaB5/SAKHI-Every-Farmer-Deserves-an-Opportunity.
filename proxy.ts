// Route guard (Next.js 16 "proxy", formerly middleware): every interface
// requires a signed session with the matching role. API routes enforce the
// same rules themselves via lib/api.ts — this layer is for page navigation.
import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME, SESSION_COOKIE, verifySession, type Role } from "@/lib/auth/token";

const RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/farmer", roles: ["FARMER"] },
  // Bulk buyers reuse the consumer shop for "Browse & buy".
  { prefix: "/shop", roles: ["CONSUMER", "BULK_BUYER"] },
  { prefix: "/bulk", roles: ["BULK_BUYER"] },
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/delivery", roles: ["DELIVERY"] },
];

/**
 * Redirects anonymous visitors to /login and wrong-role visitors to their own home.
 * @param req - incoming navigation request
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (!rule.roles.includes(session.role)) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/farmer/:path*", "/shop/:path*", "/bulk/:path*", "/admin/:path*", "/delivery/:path*"],
};
