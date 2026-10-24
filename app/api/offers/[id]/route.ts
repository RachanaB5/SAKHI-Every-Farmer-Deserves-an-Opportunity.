// POST /api/offers/[id] — negotiation and decisions:
//   buyer:  COUNTER {price} · ACCEPT (→ BULK order, stock reserved) · REJECT
//   farmer: ACCEPT_COUNTER · COUNTER {price} · WITHDRAW
// Max 2 counter rounds per offer.
import { handler } from "@/lib/api";
import { negotiateOffer } from "@/lib/bulk";
import { negotiateInput, type NegotiateInput } from "@/lib/validators/bulk";

type Params = { id: string };

/** Applies the action for whichever side is calling. */
export const POST = handler<NegotiateInput, undefined, Params>({ roles: ["BULK_BUYER", "FARMER"], body: negotiateInput }, async ({ user, params, body }) =>
  negotiateOffer(user, params.id, body),
);
