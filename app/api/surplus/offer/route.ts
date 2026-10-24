// POST /api/surplus/offer { listingId, demandId } — one-click "offer this
// surplus to that demand". Quantity and price are recomputed server-side
// from the current suggestion (never taken from the client). It creates an
// OFFER only — stock moves solely if the buyer accepts.
import { z } from "zod";
import { handler, HttpError } from "@/lib/api";
import { makeOffer } from "@/lib/bulk";
import { detectSurplus } from "@/lib/surplus";

const body = z.object({ listingId: z.string().min(1), demandId: z.string().min(1) });

/** Creates a fromSurplus offer for the farmer. */
export const POST = handler<z.infer<typeof body>>({ roles: ["FARMER"], body }, async ({ user, body }) => {
  const [item] = await detectSurplus(user.id, body.listingId);
  const s = item?.suggestions.find((x) => x.kind === "DEMAND" && x.demandId === body.demandId);
  if (!item || !s || s.kind !== "DEMAND") throw new HttpError(409, "That requirement is no longer a match for this listing");
  const offer = await makeOffer(user, body.demandId, { listingId: item.listingId, qtyKg: s.offerQty, pricePerKg: s.offerPrice, etaHours: 12, note: "Fresh surplus, can deliver today" }, { fromSurplus: true });
  return { offerId: offer.id, qtyKg: s.offerQty, pricePerKg: s.offerPrice, buyer: s.buyer };
});
