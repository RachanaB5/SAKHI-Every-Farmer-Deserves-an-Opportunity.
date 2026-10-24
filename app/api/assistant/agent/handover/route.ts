// POST /api/assistant/agent/handover { orderId } — the farmer tells Sakhi
// the parcel is with the rider: the order goes out for delivery and the
// buyer and rider see it live. The buyer's OTP still completes delivery.
import { z } from "zod";
import { handler } from "@/lib/api";
import { farmerHandedToRider } from "@/lib/delivery/handover";

const body = z.object({ orderId: z.string().min(1) });

/** Owning farmer only; a repeat call reports `already`. */
export const POST = handler<z.infer<typeof body>>({ roles: ["FARMER"], body }, async ({ user, body }) => farmerHandedToRider(body.orderId, user));
