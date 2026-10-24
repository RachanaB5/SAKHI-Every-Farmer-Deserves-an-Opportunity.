// What every sign-up route needs from a PIN and a possible Google profile:
// with a Google profile waiting the PIN is optional (the account signs in with
// Google, and gets an unguessable PIN hash); without one a PIN is required.
// The email and Google id are stored on the new account.
import "server-only";
import { HttpError } from "@/lib/api";
import { clearPendingGoogle, getPendingGoogle, unusablePin } from "@/lib/auth/google";
import { clearPendingFirebaseProfile, getPendingFirebaseProfile } from "@/lib/auth/firebase-pending";
import { hashPin } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { syncUserProfile } from "@/lib/firebase/profile";

/**
 * @param pin - the PIN the person typed, if any
 * @returns the PIN hash to store, plus the email / googleId fields to merge into the new user
 * @throws 400 when there is neither a PIN nor a Google profile, or when that Google account is already registered
 */
export async function accountCredentials(pin: string | undefined) {
  const [google, firebase] = await Promise.all([getPendingGoogle(), getPendingFirebaseProfile()]);
  if (!pin && !google && !firebase) throw new HttpError(400, "Create a 4 to 6 digit PIN");
  const email = google?.email ?? firebase?.email;
  if (
    (google || firebase) &&
    (await db.user.findFirst({
      where: {
        OR: [
          ...(google ? [{ googleId: google.sub }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      select: { id: true },
    }))
  ) {
    await clearPendingGoogle();
    await clearPendingFirebaseProfile();
    throw new HttpError(409, "This sign-in already has a FoodFlow account. Please sign in instead.");
  }
  return {
    pinHash: await hashPin(pin ?? unusablePin()),
    google: google ? { email: google.email, googleId: google.sub } : firebase ? { email: firebase.email } : null,
    /** Call once the account exists. */
    done: async (userId: string) => {
      if (google) await clearPendingGoogle();
      if (firebase) {
        const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
        await syncUserProfile(user, firebase.uid);
        await clearPendingFirebaseProfile();
      }
    },
  };
}
