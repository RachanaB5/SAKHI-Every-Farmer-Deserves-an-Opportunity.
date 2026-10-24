// POST /api/basket/match — smart basket: best listing per grocery item
// (price, ETA, freshness, quality, farm consolidation) plus alternatives.
import { z } from "zod";
import { handler } from "@/lib/api";
import { buildBasket } from "@/lib/basket";
import { browseListings } from "@/lib/listings";

const input = z.object({
  items: z
    .array(z.object({ name: z.string().trim().min(1).max(60), qty: z.coerce.number().positive().max(1000), unit: z.string().max(10) }))
    .min(1, "Add at least one item")
    .max(40),
});

/** Returns picks in the same order as the requested items. */
export const POST = handler<z.infer<typeof input>>({ roles: ["CONSUMER", "BULK_BUYER"], body: input }, async ({ user, body }) => {
  const listings = await browseListings(user, { limit: 300 });
  const picks = buildBasket(body.items, listings);
  const chosen = picks.filter((p) => p.best);
  return {
    picks,
    farms: new Set(chosen.map((p) => p.best!.farmer.id)).size,
    estimate: Math.round(chosen.reduce((s, p) => s + p.best!.price * p.best!.qty, 0)),
    unmatched: picks.filter((p) => !p.best).map((p) => p.item.name),
  };
});
