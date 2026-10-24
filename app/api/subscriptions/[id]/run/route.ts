// POST /api/subscriptions/[id]/run — "deliver the next one now": places
// the upcoming delivery immediately and moves the schedule past it.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { runSubscription } from "@/lib/subscriptions";

type Params = { id: string };

/** Runs the buyer's own active subscription early. */
export const POST = handler<undefined, undefined, Params>({ roles: ["CONSUMER"] }, async ({ user, params }) => {
  const sub = await db.subscription.findUnique({ where: { id: params.id } });
  if (!sub || sub.buyerId !== user.id) throw new HttpError(404, "Subscription not found");
  if (!sub.active) throw new HttpError(400, "Resume the plan first");
  const res = await runSubscription(sub);
  if (res.status === "taken") throw new HttpError(409, "That delivery is already being placed");
  if (res.status === "skipped") throw new HttpError(409, res.reason);
  return res;
});
