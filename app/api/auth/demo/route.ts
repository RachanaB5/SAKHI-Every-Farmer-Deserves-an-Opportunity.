// POST /api/auth/demo — one-tap persona login used by the "Try the demo"
// switcher on the landing and login pages. Only seeded accounts qualify.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { DEMO_ENABLED, DEMO_PHONE_BY_ROLE, DEMO_PHONE_PREFIX } from "@/lib/auth/demo";
import { startSession } from "@/lib/auth/session";
import { ROLE_HOME, type Role } from "@/lib/auth/token";
import { demoLoginSchema } from "@/lib/validators/auth";

/**
 * Signs in as the default persona for a role, or as a specific seeded user.
 * @returns the persona and the route to land on
 */
export const POST = handler({ body: demoLoginSchema }, async ({ body }) => {
  if (!DEMO_ENABLED) throw new HttpError(403, "Demo mode is disabled");
  const user = body.userId
    ? await db.user.findUnique({ where: { id: body.userId } })
    : body.role
      ? await db.user.findUnique({ where: { phone: DEMO_PHONE_BY_ROLE[body.role] } })
      : null;
  if (!user || !user.phone.startsWith(DEMO_PHONE_PREFIX)) {
    throw new HttpError(404, "Demo persona not found, run `npm run db:reset` to reseed");
  }
  if (user.suspended) throw new HttpError(403, "This account is suspended. An admin can reinstate it from Trust & safety.");
  await startSession({ id: user.id, role: user.role as Role, name: user.name });
  return {
    user: { id: user.id, name: user.name, role: user.role },
    redirect: ROLE_HOME[user.role as Role],
  };
});
