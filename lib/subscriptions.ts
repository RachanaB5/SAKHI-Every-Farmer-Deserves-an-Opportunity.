// Recurring orders (daily milk, weekly vegetables). A run claims the
// subscription atomically (so two schedulers can't double-order), picks a
// listing — the saved one, or the best same-crop alternative when it has
// sold out — and places a normal checkout tagged with the subscription.
import "server-only";
import type { Listing, Subscription, User } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { round2 } from "@/lib/fees";
import { visibleCategories } from "@/lib/listings";
import { placeCheckout } from "@/lib/orders/checkout";
import { serviceArea } from "@/lib/settings";
import { LEAD_HOURS, nextRun } from "@/lib/subscription-schedule";

export type RunResult =
  | { subscriptionId: string; status: "placed"; orderId: string; code: string; total: number; switchedTo: string | null }
  | { subscriptionId: string; status: "skipped"; reason: string }
  | { subscriptionId: string; status: "taken" };

/** Delivery-day label in IST, e.g. "Tue 21 Oct". */
function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/**
 * Chooses the listing for a run: the saved listing when it can cover the
 * quantity, otherwise the same crop from the same farmer, then the
 * buyer's area, then the cheapest.
 */
async function pickListing(sub: Subscription, buyer: User): Promise<{ listing: Listing; switched: boolean } | { reason: string }> {
  const area = (await serviceArea(buyer.area))?.name;
  if (!area) return { reason: `FoodFlow doesn't deliver to ${buyer.area ?? "your area"} yet` };
  const cats = await visibleCategories(area);
  const usable = (l: Listing | null): l is Listing => Boolean(l && l.status === "ACTIVE" && l.availableQty >= sub.qty && sub.qty >= l.minOrderQty && cats.includes(l.category));

  const saved = sub.listingId ? await db.listing.findUnique({ where: { id: sub.listingId } }) : null;
  const savedFarmerId = saved?.farmerId ?? null;
  if (usable(saved)) return { listing: saved, switched: false };

  const alts = (
    await db.listing.findMany({
      where: { crop: sub.crop, unit: sub.unit, status: "ACTIVE", availableQty: { gte: sub.qty }, farmer: { suspended: false } },
      orderBy: { pricePerUnit: "asc" },
      take: 30,
    })
  ).filter(usable);
  if (!alts.length) return { reason: `No ${sub.crop} available for ${sub.qty} ${sub.unit} right now` };
  const score = (l: Listing) => (l.farmerId === savedFarmerId ? 2 : 0) + (l.area === area ? 1 : 0);
  alts.sort((a, b) => score(b) - score(a) || a.pricePerUnit - b.pricePerUnit);
  return { listing: alts[0], switched: true };
}

/**
 * Runs one subscription now.
 * Scheduled runs advance to the next slot after now; an early "deliver
 * now" replaces the upcoming delivery, so the schedule moves past it.
 * @param sub - the subscription as last read
 */
export async function runSubscription(sub: Subscription, now: Date = new Date()): Promise<RunResult> {
  const from = sub.nextRunAt > now ? sub.nextRunAt : now;
  const { runAt: following } = nextRun(sub.frequency, sub.dayOfWeek, sub.preferredSlot, from);
  // Claim: only the caller that still sees the same nextRunAt proceeds.
  const claimed = await db.subscription.updateMany({
    where: { id: sub.id, active: true, nextRunAt: sub.nextRunAt },
    data: { nextRunAt: following, lastRunAt: now },
  });
  if (claimed.count === 0) return { subscriptionId: sub.id, status: "taken" };

  const skip = async (reason: string): Promise<RunResult> => {
    await audit({ action: "SUBSCRIPTION_SKIPPED", entity: "Subscription", entityId: sub.id, meta: { reason } });
    publish({ type: "order.updated", id: sub.id, userIds: [sub.buyerId], data: { subscription: "skipped", reason } });
    return { subscriptionId: sub.id, status: "skipped", reason };
  };

  const buyer = await db.user.findUnique({ where: { id: sub.buyerId } });
  if (!buyer || buyer.suspended) return skip("Buyer account unavailable");
  const pick = await pickListing(sub, buyer);
  if ("reason" in pick) return skip(pick.reason);

  // The delivery this run serves: the slot right after the run instant.
  const deliveryAt = new Date(Math.max(now.getTime(), sub.nextRunAt.getTime()) + LEAD_HOURS * 3_600_000);
  try {
    const res = await placeCheckout(
      buyer,
      {
        items: [{ listingId: pick.listing.id, qty: sub.qty }],
        fulfilment: "DELIVERY",
        area: buyer.area ?? undefined,
        addressLine: buyer.address ?? undefined,
        slot: `${dayLabel(deliveryAt)}, ${sub.preferredSlot}`,
        paymentMethod: "UPI",
      },
      { subscriptionId: sub.id, notes: "Subscription delivery" },
    );
    const order = res.placed[0];
    if (!order) return skip(res.failed[0]?.reason ?? "Stock ran out while ordering");
    if (pick.switched) await db.subscription.update({ where: { id: sub.id }, data: { listingId: pick.listing.id } });
    return { subscriptionId: sub.id, status: "placed", orderId: order.id, code: order.code, total: round2(order.total), switchedTo: pick.switched ? pick.listing.title : null };
  } catch (e) {
    if (e instanceof HttpError) return skip(e.message);
    throw e;
  }
}

/** Runs every active subscription whose next run is due. */
export async function runDueSubscriptions(now: Date = new Date(), limit = 100) {
  const due = await db.subscription.findMany({ where: { active: true, nextRunAt: { lte: now } }, orderBy: { nextRunAt: "asc" }, take: limit });
  const results: RunResult[] = [];
  for (const sub of due) results.push(await runSubscription(sub, now));
  return {
    due: due.length,
    placed: results.filter((r) => r.status === "placed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}
