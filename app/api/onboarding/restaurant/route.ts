// POST /api/onboarding/restaurant — restaurant / hostel / community-kitchen
// sign-up: creates the BULK_BUYER account with the kitchen's address saved,
// keeps the optional licence and volume answers on its onboarding profile and
// signs in.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { coordsFor } from "@/lib/areas";
import { accountCredentials } from "@/lib/auth/new-account";
import { startSession } from "@/lib/auth/session";
import { ROLE_HOME } from "@/lib/auth/token";
import { rateLimit } from "@/lib/rate-limit";
import { restaurantOnboardingSchema } from "@/lib/validators/onboarding";

/** Creates the restaurant account and profile. */
export const POST = handler({ body: restaurantOnboardingSchema }, async ({ body, req }) => {
  rateLimit(`register:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 60 * 60_000);
  if (await db.user.findUnique({ where: { phone: body.phone } })) {
    throw new HttpError(409, "An account with this phone number already exists, sign in instead");
  }
  const at = coordsFor(body.area);
  const line = `${body.addressLine}, ${body.area} ${body.pincode}`;
  const { pin, ...answers } = body;
  const creds = await accountCredentials(pin);
  const user = await db.user.create({
    data: {
      name: body.contactName,
      phone: body.phone,
      pinHash: creds.pinHash,
      ...creds.google,
      role: "BULK_BUYER",
      language: body.language,
      area: body.area,
      address: line,
      lat: at?.lat,
      lng: at?.lng,
      orgName: body.orgName,
      orgType: body.orgType,
      addresses: { create: { label: "Kitchen", line, area: body.area, lat: at?.lat, lng: at?.lng } },
      onboarding: { create: { kind: "RESTAURANT", data: answers } },
    },
  });
  await creds.done(user.id);
  await startSession({ id: user.id, role: "BULK_BUYER", name: user.name });
  return { user: { id: user.id, name: user.name, role: user.role }, redirect: ROLE_HOME.BULK_BUYER };
});
