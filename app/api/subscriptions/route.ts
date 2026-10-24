// /api/subscriptions — the signed-in household's recurring orders.
// GET  → plans with their listing, next delivery and recent orders
// POST → start a plan for a listing (daily or weekly, with a slot)
import { db } from "@/lib/db";
import { handler, HttpError } from "@/lib/api";
import { visibleCategories } from "@/lib/listings";
import { serviceArea } from "@/lib/settings";
import { describeSchedule, LEAD_HOURS, nextRun } from "@/lib/subscription-schedule";
import { createSubscriptionSchema } from "@/lib/validators/subscription";

/** Lists the buyer's subscriptions, newest first. */
export const GET = handler({ roles: ["CONSUMER"] }, async ({ user }) => {
  const subs = await db.subscription.findMany({
    where: { buyerId: user.id },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: { listing: { include: { farmer: { select: { name: true, farmerProfile: { select: { village: true } } } } } } },
  });
  const orders = await db.order.findMany({
    where: { subscriptionId: { in: subs.map((s) => s.id) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, status: true, total: true, createdAt: true, subscriptionId: true },
  });
  return subs.map((s) => {
    const l = s.listing;
    return {
      id: s.id,
      crop: s.crop,
      qty: s.qty,
      unit: s.unit,
      frequency: s.frequency,
      dayOfWeek: s.dayOfWeek,
      preferredSlot: s.preferredSlot,
      schedule: describeSchedule(s.frequency, s.dayOfWeek, s.preferredSlot),
      active: s.active,
      nextDeliveryAt: s.active ? new Date(s.nextRunAt.getTime() + LEAD_HOURS * 3_600_000).toISOString() : null,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      listing: l
        ? { id: l.id, title: l.title, imageUrl: l.imageUrl, pricePerUnit: l.pricePerUnit, status: l.status, availableQty: l.availableQty, farmer: l.farmer.name, village: l.farmer.farmerProfile?.village ?? null }
        : null,
      estimate: l ? Math.round(l.pricePerUnit * s.qty) : null,
      orders: orders.filter((o) => o.subscriptionId === s.id).slice(0, 3).map((o) => ({ id: o.id, code: o.code, status: o.status, total: o.total, createdAt: o.createdAt.toISOString() })),
    };
  });
});

/** Creates a subscription; the first order is placed at the first run time. */
export const POST = handler({ roles: ["CONSUMER"], body: createSubscriptionSchema }, async ({ user, body }) => {
  const area = await serviceArea(user.area);
  if (!area) throw new HttpError(422, `FoodFlow doesn't deliver to ${user.area ?? "your area"} yet`);
  const listing = await db.listing.findUnique({ where: { id: body.listingId } });
  if (!listing || listing.status !== "ACTIVE") throw new HttpError(404, "That listing isn't available any more");
  if (!(await visibleCategories(area.name)).includes(listing.category)) throw new HttpError(422, `${listing.title} isn't sold in ${area.name} yet`);
  if (body.qty < listing.minOrderQty) throw new HttpError(400, `Minimum ${listing.minOrderQty} ${listing.unit} per delivery`);
  const dup = await db.subscription.findFirst({ where: { buyerId: user.id, crop: listing.crop, active: true } });
  if (dup) throw new HttpError(409, `You already have an active ${listing.crop} plan, edit that one instead`);

  const dayOfWeek = body.frequency === "WEEKLY" ? (body.dayOfWeek ?? 0) : null;
  const { runAt } = nextRun(body.frequency, dayOfWeek, body.preferredSlot);
  const sub = await db.subscription.create({
    data: { buyerId: user.id, listingId: listing.id, crop: listing.crop, qty: body.qty, unit: listing.unit, frequency: body.frequency, dayOfWeek, preferredSlot: body.preferredSlot, nextRunAt: runAt },
  });
  return { id: sub.id, schedule: describeSchedule(sub.frequency, sub.dayOfWeek, sub.preferredSlot), nextDeliveryAt: new Date(runAt.getTime() + LEAD_HOURS * 3_600_000).toISOString() };
});
