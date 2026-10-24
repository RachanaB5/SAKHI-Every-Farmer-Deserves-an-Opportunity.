// POST /api/deliveries/[orderId]/pickup — rider collected the parcel from
// the farm: delivery PICKED_UP, order OUT_FOR_DELIVERY.
import { handler } from "@/lib/api";
import { riderPickedUp } from "@/lib/delivery/handover";

type Params = { orderId: string };

/** Assigned rider only. */
export const POST = handler<undefined, undefined, Params>({ roles: ["DELIVERY"] }, async ({ user, params }) => riderPickedUp(params.orderId, user));
