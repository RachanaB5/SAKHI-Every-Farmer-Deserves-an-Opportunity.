// POST /api/auth/login — phone + PIN sign-in for every role.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { verifyPin } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { ROLE_HOME, type Role } from "@/lib/auth/token";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validators/auth";

/**
 * Verifies the PIN and sets the session cookie.
 * Rate-limited per phone number to slow down PIN guessing.
 * @returns the signed-in user and the role's home route
 */
export const POST = handler({ body: loginSchema }, async ({ body }) => {
  rateLimit(`login:${body.phone}`, 8, 5 * 60_000);
  const user = await db.user.findUnique({ where: { phone: body.phone } });
  // Same message for unknown phone and wrong PIN so accounts can't be enumerated.
  if (!user || !(await verifyPin(body.pin, user.pinHash))) {
    throw new HttpError(401, "Phone number or PIN is incorrect");
  }
  if (user.suspended) throw new HttpError(403, "This account is suspended. Contact support.");
  await startSession({ id: user.id, role: user.role as Role, name: user.name });
  return {
    user: { id: user.id, name: user.name, role: user.role },
    redirect: ROLE_HOME[user.role as Role],
  };
});
