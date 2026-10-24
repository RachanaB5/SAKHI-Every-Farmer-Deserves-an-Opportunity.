// POST /api/auth/phone/verify — checks the texted code { phone, purpose, code }.
// A correct code marks this browser as having proven the number for 20
// minutes, which sign-up and PIN reset require.
import { handler } from "@/lib/api";
import { checkPhoneCode, rememberVerifiedPhone } from "@/lib/auth/phone-code";
import { phoneCodeCheckSchema, type PhoneCodeCheck } from "@/lib/validators/auth";

/** Verifies the code. */
export const POST = handler<PhoneCodeCheck>({ body: phoneCodeCheckSchema }, async ({ body }) => {
  await checkPhoneCode(body.phone, body.purpose, body.code);
  await rememberVerifiedPhone(body.phone, body.purpose);
  return { verified: true };
});
