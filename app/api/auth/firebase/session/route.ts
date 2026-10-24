import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { setPendingFirebaseProfile } from "@/lib/auth/firebase-pending";
import { startSession } from "@/lib/auth/session";
import { ROLE_HOME, type Role } from "@/lib/auth/token";
import { syncUserProfile } from "@/lib/firebase/profile";

const schema = z.object({ idToken: z.string().min(1) });

/** Exchanges a verified Firebase identity for the app's existing role session. */
export const POST = handler({ body: schema }, async ({ body }) => {
  const { firebaseAdminAuth, firebaseAdminFirestore } = await import("@/lib/firebase/admin");
  let identity;
  try {
    identity = await firebaseAdminAuth.verifyIdToken(body.idToken);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
    if (code === "auth/user-disabled") throw new HttpError(403, "This Firebase account is disabled.");
    if (code?.startsWith("auth/")) throw new HttpError(401, "Your Firebase sign-in has expired. Please sign in again.");
    throw error;
  }

  const email = identity.email?.trim().toLowerCase();
  const firebaseUid = identity.uid;
  if (!email) throw new HttpError(400, "Your Firebase account must have a verified email address.");
  if (identity.email_verified !== true) throw new HttpError(403, "Verify your email address before signing in.");

  const linkRef = firebaseAdminFirestore.collection("firebaseAuthLinks").doc(firebaseUid);
  const link = await linkRef.get();
  let user = link.exists ? await db.user.findUnique({ where: { id: String(link.data()?.userId) } }) : null;

  if (!user) {
    user = await db.user.findFirst({
      where: { OR: [{ email }, ...(identity.firebase?.sign_in_provider === "google.com" ? [{ googleId: firebaseUid }] : [])] },
    });
  }

  if (user) {
    if (user.suspended) throw new HttpError(403, "This account is suspended. Contact support.");
    await syncUserProfile(user, firebaseUid);
    await startSession({ id: user.id, role: user.role as Role, name: user.name });
    return { onboardingRequired: false, redirect: ROLE_HOME[user.role as Role] };
  }

  const providerId = identity.firebase?.sign_in_provider ?? "password";
  await setPendingFirebaseProfile({
    uid: firebaseUid,
    email,
    name: identity.name?.trim() || email.split("@")[0],
    providerId,
  });
  return { onboardingRequired: true, redirect: "/login?firebase=1" };
});
