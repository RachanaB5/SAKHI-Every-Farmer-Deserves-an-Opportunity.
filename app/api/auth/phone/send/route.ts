// POST /api/auth/phone/send — texts a 6-digit code to prove a mobile number.
//   { phone, purpose: "SIGNUP" }  before joining (the number must be new)
//   { phone, purpose: "RESET" }   to set a new PIN (the number must have an account)
// Returns { resendInSeconds, demoCode? }; demoCode only when no SMS provider is set up (lib/sms.ts).
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { sendPhoneCode } from "@/lib/auth/phone-code";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { phoneCodeRequestSchema, type PhoneCodeRequest } from "@/lib/validators/auth";

/** Sends the code. */
export const POST = handler<PhoneCodeRequest>({ body: phoneCodeRequestSchema }, async ({ body, req }) => {
  rateLimit(`phone-code:${clientIp(req.headers)}`, 20, 60 * 60_000);
  const account = await db.user.findUnique({ where: { phone: body.phone }, select: { id: true } });
  if (body.purpose === "SIGNUP" && account) throw new HttpError(409, "An account with this number already exists. Sign in instead.");
  if (body.purpose === "RESET" && !account) throw new HttpError(404, "No account uses this number. Join FoodFlow instead.");
  return sendPhoneCode(body.phone, body.purpose);
});
