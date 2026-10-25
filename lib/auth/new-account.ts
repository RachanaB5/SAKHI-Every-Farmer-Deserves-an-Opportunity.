// What every sign-up route needs from a PIN and a possible Google profile:
// with a Google profile waiting the PIN is optional (the account signs in with
// Google, and gets an unguessable PIN hash); without one a PIN is required.
// The email and Google id are stored on the new account.
import "server-only";
import { HttpError } from "@/lib/api";
import { clearPendingGoogle, getPendingGoogle, unusablePin } from "@/lib/auth/google";
import { hashPin } from "@/lib/auth/password";
import { db } from "@/lib/db";

/**
 * @param pin - the PIN the person typed, if any
 * @returns the PIN hash to store, plus the email / googleId fields to merge into the new user
 * @throws 400 when there is neither a PIN nor a Google profile, or when that Google account is already registered
 */
export async function accountCredentials(pin: string | undefined) {
  const google = await getPendingGoogle();
  if (!pin && !google) throw new HttpError(400, "Create a 4 to 6 digit PIN");
  if (google && (await db.user.findFirst({ where: { OR: [{ googleId: google.sub }, { email: google.email }] }, select: { id: true } }))) {
    await clearPendingGoogle();
    throw new HttpError(409, "This Google account already has a FoodFlow account, sign in with Google instead");
  }
  return {
    pinHash: await hashPin(pin ?? unusablePin()),
    google: google ? { email: google.email, googleId: google.sub } : null,
    /** Call once the account exists. */
    done: async () => {
      if (google) await clearPendingGoogle();
    },
  };
}
