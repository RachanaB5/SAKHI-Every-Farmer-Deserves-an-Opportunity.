import "server-only";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";

export async function syncUserProfile(user: User, firebaseUid?: string): Promise<void> {
  const { firebaseAdminFirestore } = await import("./admin");
  const [farmerProfile, addresses, onboarding] = await Promise.all([
    db.farmerProfile.findUnique({ where: { userId: user.id } }),
    db.address.findMany({ where: { userId: user.id } }),
    db.onboardingProfile.findUnique({ where: { userId: user.id } }),
  ]);
  const { pinHash, googleId, ...profile } = user;
  const firestore = firebaseAdminFirestore;
  const batch = firestore.batch();
  batch.set(firestore.collection("User").doc(user.id), profile, { merge: true });
  if (farmerProfile) batch.set(firestore.collection("FarmerProfile").doc(farmerProfile.id), farmerProfile, { merge: true });
  if (onboarding) batch.set(firestore.collection("OnboardingProfile").doc(onboarding.id), onboarding, { merge: true });
  for (const address of addresses) {
    batch.set(firestore.collection("Address").doc(address.id), address, { merge: true });
  }
  batch.set(
    firestore.collection("authCredentials").doc(user.id),
    { pinHash, googleId: googleId ?? null, firebaseUid: firebaseUid ?? null },
    { merge: true },
  );
  if (firebaseUid) {
    batch.set(
      firestore.collection("firebaseAuthLinks").doc(firebaseUid),
      { userId: user.id, email: user.email, linkedAt: new Date() },
      { merge: true },
    );
  }
  await batch.commit();
}
