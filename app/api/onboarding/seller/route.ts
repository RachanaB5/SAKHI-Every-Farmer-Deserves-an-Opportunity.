// POST /api/onboarding/seller — finishes the seller wizard: creates the
// account (a FARMER user with a farm profile), saves the answers as structured
// preferences, records the farm as the first saved address and signs in.
// Bank details are deliberately not accepted: payouts are set up later through
// a payment provider's secure flow.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { coordsFor } from "@/lib/areas";
import { accountCredentials } from "@/lib/auth/new-account";
import { startSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/token";
import { rateLimit } from "@/lib/rate-limit";
import { sellerOnboardingSchema } from "@/lib/validators/onboarding";

/** Creates the seller account and profile. */
export const POST = handler({ body: sellerOnboardingSchema }, async ({ body, req }) => {
  rateLimit(`register:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 60 * 60_000);
  if (await db.user.findUnique({ where: { phone: body.phone } })) {
    throw new HttpError(409, "An account with this phone number already exists, sign in instead");
  }
  const at = coordsFor(body.village) ?? coordsFor(body.area);
  const line = `${body.addressLine}, ${body.village}, ${body.district}, ${body.state} ${body.pincode}`;
  const { pin, ...answers } = body;
  const creds = await accountCredentials(pin, body.phone);
  const user = await db.user.create({
    data: {
      name: body.contactName,
      phone: body.phone,
      pinHash: creds.pinHash,
      phoneVerifiedAt: creds.phoneVerifiedAt,
      ...creds.google,
      role: "FARMER",
      language: body.language,
      area: body.area,
      address: line,
      lat: at?.lat,
      lng: at?.lng,
      farmerProfile: { create: { farmName: body.businessName, village: body.village, crops: body.crops } },
      addresses: { create: { label: "Farm", line, area: body.area, lat: at?.lat, lng: at?.lng } },
      onboarding: { create: { kind: "SELLER", data: answers } },
    },
  });
  await creds.done(user.id);
  await startSession({ id: user.id, role: "FARMER", name: user.name });
  return { user: { id: user.id, name: user.name, role: user.role }, redirect: ROLE_HOME.FARMER };
});
