// /api/subscriptions/[id] — owner-only edit (pause / resume, quantity,
// schedule) and cancel.
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { describeSchedule, nextRun } from "@/lib/subscription-schedule";
import { updateSubscriptionSchema, type UpdateSubscriptionInput } from "@/lib/validators/subscription";

type Params = { id: string };

async function own(id: string, userId: string) {
  const sub = await db.subscription.findUnique({ where: { id } });
  if (!sub || sub.buyerId !== userId) throw new HttpError(404, "Subscription not found");
  return sub;
}

/** Updates a plan. Schedule changes and resuming recompute the next run. */
export const PATCH = handler<UpdateSubscriptionInput, undefined, Params>({ roles: ["CONSUMER"], body: updateSubscriptionSchema }, async ({ user, params, body }) => {
  const sub = await own(params.id, user.id);
  const frequency = body.frequency ?? sub.frequency;
  const dayOfWeek = frequency === "WEEKLY" ? (body.dayOfWeek ?? sub.dayOfWeek ?? 0) : null;
  const preferredSlot = body.preferredSlot ?? sub.preferredSlot;
  const scheduleChanged = frequency !== sub.frequency || dayOfWeek !== sub.dayOfWeek || preferredSlot !== sub.preferredSlot;
  const resuming = body.active === true && !sub.active;
  const updated = await db.subscription.update({
    where: { id: sub.id },
    data: {
      ...(body.active !== undefined && { active: body.active }),
      ...(body.qty !== undefined && { qty: body.qty }),
      frequency,
      dayOfWeek,
      preferredSlot,
      ...((scheduleChanged || resuming) && { nextRunAt: nextRun(frequency, dayOfWeek, preferredSlot).runAt }),
    },
  });
  return { id: updated.id, active: updated.active, qty: updated.qty, schedule: describeSchedule(updated.frequency, updated.dayOfWeek, updated.preferredSlot) };
});

/** Cancels (deletes) a plan. Past orders keep their history. */
export const DELETE = handler<undefined, undefined, Params>({ roles: ["CONSUMER"] }, async ({ user, params }) => {
  const sub = await own(params.id, user.id);
  await db.subscription.delete({ where: { id: sub.id } });
  return { id: sub.id, deleted: true };
});
