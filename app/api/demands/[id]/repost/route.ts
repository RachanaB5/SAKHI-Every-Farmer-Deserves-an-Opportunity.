// POST /api/demands/[id]/repost — next cycle of a recurring requirement:
// copies it with the deadline moved forward by its frequency.
import { handler, HttpError } from "@/lib/api";
import { createDemands, loadDemand } from "@/lib/bulk";
import { isCropSlug } from "@/lib/crops";

type Params = { id: string };

/** Creates the next occurrence; returns its id. */
export const POST = handler<undefined, undefined, Params>({ roles: ["BULK_BUYER"], body: undefined }, async ({ user, params }) => {
  const d = await loadDemand(params.id);
  if (d.buyerId !== user.id) throw new HttpError(403, "Not your requirement");
  if (!d.recurring) throw new HttpError(400, "This requirement doesn't repeat");
  if (!isCropSlug(d.crop)) throw new HttpError(400, "Unknown crop on this requirement");
  const crop = d.crop;
  const step = d.frequency === "DAILY" ? 1 : 7;
  let next = new Date(d.deadline.getTime() + step * 86_400_000);
  while (next.getTime() < Date.now() + 3_600_000) next = new Date(next.getTime() + step * 86_400_000);
  const [created] = await createDemands(user, [
    { crop, qtyKg: d.qtyKg, grade: d.grade as "A" | "B" | "C" | "ANY", targetPrice: d.targetPrice, deadline: next.toISOString(), urgent: false, recurring: true, frequency: d.frequency, notes: d.notes ?? undefined, source: "FORM" },
  ]);
  return { id: created.id, deadline: next.toISOString() };
});
