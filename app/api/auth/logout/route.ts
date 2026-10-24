// POST /api/auth/logout — clears the session cookie.
import { handler } from "@/lib/api";
import { endSession } from "@/lib/auth/session";

/** Ends the current session (idempotent). */
export const POST = handler({}, async () => {
  await endSession();
  return { signedOut: true };
});
