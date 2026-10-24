// POST /api/deliveries/[orderId]/arrived — the rider has reached the farm.
// The farmer is told to check the order code and hand the parcel over.
import { handler } from "@/lib/api";
import { riderArrived } from "@/lib/delivery/arrival";

type Params = { orderId: string };

/** Assigned rider only, before pickup; a second tap is a no-op. */
export const POST = handler<undefined, undefined, Params>({ roles: ["DELIVERY"] }, async ({ user, params }) => riderArrived(params.orderId, user));
