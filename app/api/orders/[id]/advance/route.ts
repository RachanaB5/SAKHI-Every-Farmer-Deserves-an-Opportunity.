// POST /api/orders/[id]/advance — farmer fulfilment actions:
//   PACK | BOOK_DELIVERY (one click: packs if needed, assigns a rider) | READY_FOR_PICKUP
import { z } from "zod";
import { handler } from "@/lib/api";
import { bookDelivery, markPacked, markReadyForPickup } from "@/lib/delivery/assign";

type Params = { id: string };
const body = z.object({ action: z.enum(["PACK", "BOOK_DELIVERY", "READY_FOR_PICKUP"]) });

/** Applies the action for the owning farmer. */
export const POST = handler<z.infer<typeof body>, undefined, Params>({ roles: ["FARMER"], body }, async ({ user, params, body }) => {
  if (body.action === "PACK") {
    await markPacked(params.id, user.id);
    return { status: "PACKED" };
  }
  if (body.action === "READY_FOR_PICKUP") {
    await markReadyForPickup(params.id, user.id);
    return { status: "READY_FOR_PICKUP" };
  }
  return bookDelivery(params.id, user.id);
});
