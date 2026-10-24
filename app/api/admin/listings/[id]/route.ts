// PATCH /api/admin/listings/[id] — admin pause / resume of a live listing
// (e.g. a price outlier pending a word with the farmer). Audit-logged.
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";

type Params = { id: string };
const body = z.object({ status: z.enum(["ACTIVE", "PAUSED"]), reason: z.string().trim().max(300).optional() });

/** Sets the listing status. Resuming is refused while the farmer is suspended or stock is gone. */
export const PATCH = handler<z.infer<typeof body>, undefined, Params>({ roles: ["ADMIN"], body }, async ({ user, params, body }) => {
  const listing = await db.listing.findUnique({ where: { id: params.id }, include: { farmer: { select: { suspended: true } } } });
  if (!listing) throw new HttpError(404, "Listing not found");
  if (listing.status === "REMOVED") throw new HttpError(409, "The farmer removed this listing");
  if (body.status === "ACTIVE" && listing.farmer.suspended) throw new HttpError(400, "Reinstate the farmer before resuming their listings");
  if (body.status === "ACTIVE" && listing.availableQty <= 0) throw new HttpError(400, "Nothing left to sell on this listing");
  await db.listing.update({ where: { id: listing.id }, data: { status: body.status } });
  await audit({ actorId: user.id, action: body.status === "PAUSED" ? "LISTING_PAUSED" : "LISTING_RESUMED", entity: "Listing", entityId: listing.id, meta: { reason: body.reason ?? null } });
  publish({ type: "inventory.updated", id: listing.id, userIds: [listing.farmerId], roles: ["CONSUMER", "BULK_BUYER"] });
  return { id: listing.id, status: body.status };
});
