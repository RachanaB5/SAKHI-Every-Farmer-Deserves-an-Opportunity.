// POST /api/demands/[id]/offers — farmer offers (or revises an offer) for
// an open requirement, backed by one of their live listings.
import { handler } from "@/lib/api";
import { makeOffer } from "@/lib/bulk";
import { offerInput, type OfferInput } from "@/lib/validators/bulk";

type Params = { id: string };

/** Creates/updates the farmer's offer. */
export const POST = handler<OfferInput, undefined, Params>({ roles: ["FARMER"], body: offerInput }, async ({ user, params, body }) => {
  const offer = await makeOffer(user, params.id, body);
  return { id: offer.id, status: offer.status };
});
