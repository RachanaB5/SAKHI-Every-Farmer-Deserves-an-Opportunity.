// DELETE /api/auth/google/pending — "not me": forget the Google profile waiting to be used for sign-up.
import { clearPendingGoogle } from "@/lib/auth/google";
import { clearPendingFirebaseProfile } from "@/lib/auth/firebase-pending";
import { handler } from "@/lib/api";

/** Clears the pending Google profile. */
export const DELETE = handler({}, async () => {
  await clearPendingGoogle();
  await clearPendingFirebaseProfile();
  return { cleared: true };
});
