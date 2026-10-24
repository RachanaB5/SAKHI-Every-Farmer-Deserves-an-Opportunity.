// What every sign-up route needs before it creates an account: the mobile
// number proven with a texted code (lib/auth/phone-code.ts), and a PIN or a
// Google or Firebase profile. With a federated profile waiting the PIN is
// optional; otherwise a PIN is required. The email and Google id are stored.
import "server-only";
import { HttpError } from "@/lib/api";
import { clearPendingGoogle, getPendingGoogle, unusablePin } from "@/lib/auth/google";
import { clearPendingFirebaseProfile, getPendingFirebaseProfile } from "@/lib/auth/firebase-pending";
import { hashPin } from "@/lib/auth/password";
import { clearVerifiedPhone, phoneIsVerified } from "@/lib/auth/phone-code";
import { db } from "@/lib/db";
import { syncUserProfile } from "@/lib/firebase/profile";

/**
 * @param pin - the PIN the person typed, if any
 * @param phone - the normalised mobile number of the new account
 * @returns the PIN hash and phone verification time to store, plus profile fields for the new user
 * @throws 403 when the number wasn't proven with a code; 400 when a PIN or federated profile is missing; 409 when the profile is already registered
 */
export async function accountCredentials(pin: string | undefined, phone: string) {
  if (!(await phoneIsVerified(phone, "SIGNUP"))) throw new HttpError(403, "Verify your mobile number with the code we sent first");
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
    phoneVerifiedAt: new Date(),
    google: google ? { email: google.email, googleId: google.sub } : firebase ? { email: firebase.email } : null,
    /** Call once the account exists. */
    done: async (userId?: string) => {
      const firebaseUserId = firebase ? userId : null;
      if (firebase && !firebaseUserId) throw new Error("A user ID is required to link the Firebase profile");
      await clearVerifiedPhone();
      if (google) await clearPendingGoogle();
      if (firebase && firebaseUserId) {
        const user = await db.user.findUniqueOrThrow({ where: { id: firebaseUserId } });
        await syncUserProfile(user, firebase.uid);
        await clearPendingFirebaseProfile();
      }
    },
  };
}
