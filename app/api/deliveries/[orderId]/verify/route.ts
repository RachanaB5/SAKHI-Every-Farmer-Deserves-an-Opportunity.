// POST /api/deliveries/[orderId]/verify { otp } — rider submits the
// recipient's code. Assigned rider only; OTP checked against the stored
// HMAC with expiry and attempt limits; idempotent on repeat calls.
import { z } from "zod";
import { handler } from "@/lib/api";
import { verifyHandover } from "@/lib/delivery/handover";
import { rateLimit } from "@/lib/rate-limit";

type Params = { orderId: string };
const body = z.object({ otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

/** Returns ok/already, or why it failed and attempts left. */
export const POST = handler<z.infer<typeof body>, undefined, Params>({ roles: ["DELIVERY"], body }, async ({ user, params, body }) => {
  rateLimit(`verify:${user.id}`, 30, 60_000);
  return verifyHandover(params.orderId, user, { otp: body.otp });
});
