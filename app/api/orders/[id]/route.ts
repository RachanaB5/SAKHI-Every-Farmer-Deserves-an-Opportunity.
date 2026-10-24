// GET /api/orders/[id] — one order with timeline, payment, delivery.
import { handler } from "@/lib/api";
import { loadOrderFor, serializeOrder } from "@/lib/orders/queries";

type Params = { id: string };

/** Visible to the buyer, farmer, assigned rider and admins. */
export const GET = handler<undefined, undefined, Params>({ roles: [] }, async ({ user, params }) =>
  serializeOrder(await loadOrderFor(user, params.id), user),
);
