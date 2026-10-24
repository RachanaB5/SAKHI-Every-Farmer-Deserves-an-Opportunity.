// POST /api/auth/reset-pin — sets a new PIN { phone, pin } after the number
// was proven with a texted code (purpose RESET), then signs in.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPin } from "@/lib/auth/password";
import { clearVerifiedPhone, phoneIsVerified } from "@/lib/auth/phone-code";
import { startSession } from "@/lib/auth/session";
import { ROLE_HOME, type Role } from "@/lib/auth/token";
import { resetPinSchema, type ResetPinInput } from "@/lib/validators/auth";

/** Replaces the PIN. */
export const POST = handler<ResetPinInput>({ body: resetPinSchema }, async ({ body }) => {
  if (!(await phoneIsVerified(body.phone, "RESET"))) throw new HttpError(403, "Verify your mobile number with the code we sent first");
  const user = await db.user.findUnique({ where: { phone: body.phone } });
  if (!user) throw new HttpError(404, "No account uses this number");
  await db.user.update({ where: { id: user.id }, data: { pinHash: await hashPin(body.pin), phoneVerifiedAt: new Date() } });
  await clearVerifiedPhone();
  await audit({ actorId: user.id, action: "PIN_RESET", entity: "User", entityId: user.id });
  if (user.suspended) throw new HttpError(403, "Your PIN is changed, but this account is suspended. Contact support.");
  await startSession({ id: user.id, role: user.role as Role, name: user.name });
  return { user: { id: user.id, name: user.name, role: user.role }, redirect: ROLE_HOME[user.role as Role] };
});
