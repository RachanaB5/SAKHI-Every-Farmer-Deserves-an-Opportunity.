// POST /api/deliveries/[orderId]/verify { otp } — rider submits the
// recipient's code. Assigned rider only; OTP checked against the stored
// HMAC with expiry and attempt limits; idempotent on repeat calls.
import { z } from "zod";
import { handler } from "@/lib/api";
import { onDelivered } from "@/lib/assistant/autopilot";
import { verifyHandover } from "@/lib/delivery/handover";
import { rateLimit } from "@/lib/rate-limit";

type Params = { orderId: string };
const body = z.object({ otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

/** Returns ok/already, or why it failed and attempts left. */
export const POST = handler<z.infer<typeof body>, undefined, Params>({ roles: ["DELIVERY"], body }, async ({ user, params, body }) => {
  rateLimit(`verify:${user.id}`, 30, 60_000);
  const result = await verifyHandover(params.orderId, user, { otp: body.otp });
  // Sakhi tells an autopilot farmer it arrived and what they'll be paid.
  if (result.ok && !result.already) await onDelivered(params.orderId, result.settlementNet ?? 0);
  return result;
});
