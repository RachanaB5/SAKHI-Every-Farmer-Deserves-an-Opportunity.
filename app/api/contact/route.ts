// POST /api/contact — the landing page's "Connect with us" form. Stored for
// the team to follow up; no account needed.
import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { contactSchema } from "@/lib/validators/onboarding";

/** Saves the message. */
export const POST = handler({ body: contactSchema }, async ({ body, req }) => {
  rateLimit(`contact:${req.headers.get("x-forwarded-for") ?? "local"}`, 5, 60 * 60_000);
  await db.contactMessage.create({
    data: { name: body.name, email: body.email || null, phone: body.phone || null, topic: body.topic, message: body.message },
  });
  return { received: true };
});
