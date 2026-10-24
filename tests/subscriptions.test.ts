// Subscriptions: IST slot scheduling, one order per run even when two
// schedulers race, fallback to another listing when the saved one sold
// out, and skip-and-advance when nothing is available.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { nextRun, slotStartHour } from "@/lib/subscription-schedule";
import { runDueSubscriptions, runSubscription } from "@/lib/subscriptions";
import { makeListing, makeUser } from "./helpers";

describe("subscription schedule", () => {
  it("parses slot start hours", () => {
    expect(slotStartHour("6–8 AM")).toBe(6);
    expect(slotStartHour("9–11 AM")).toBe(9);
    expect(slotStartHour("5–7 PM")).toBe(17);
    expect(slotStartHour("whenever")).toBe(7);
  });

  it("places a daily order two hours before the next IST slot", () => {
    // Tue 20 Oct 2026, 05:30 IST — today's 6 AM run time (4 AM) has passed.
    const from = new Date("2026-10-20T00:00:00Z");
    const { runAt, deliveryAt } = nextRun("DAILY", null, "6–8 AM", from);
    expect(deliveryAt.toISOString()).toBe("2026-10-21T00:30:00.000Z"); // Wed 06:00 IST
    expect(runAt.toISOString()).toBe("2026-10-20T22:30:00.000Z"); // Wed 04:00 IST
  });

  it("uses today's slot when its run time is still ahead", () => {
    const from = new Date("2026-10-19T20:00:00Z"); // Tue 01:30 IST
    expect(nextRun("DAILY", null, "6–8 AM", from).deliveryAt.toISOString()).toBe("2026-10-20T00:30:00.000Z");
  });

  it("finds the next matching weekday for weekly plans", () => {
    const from = new Date("2026-10-20T06:00:00Z"); // Tuesday
    const { deliveryAt } = nextRun("WEEKLY", 0, "9–11 AM", from);
    expect(deliveryAt.toISOString()).toBe("2026-10-25T03:30:00.000Z"); // Sun 09:00 IST
  });
});

describe("subscription runs", () => {
  let buyer: Awaited<ReturnType<typeof makeUser>>;
  let farmerA: string;
  let farmerB: string;

  beforeAll(async () => {
    await db.serviceArea.upsert({ where: { name: "Yelahanka" }, create: { name: "Yelahanka", lat: 13.1, lng: 77.59, radiusKm: 6, baseDeliveryFee: 25 }, update: { active: true } });
    await db.category.upsert({ where: { slug: "vegetables" }, create: { slug: "vegetables", name: "Vegetables", enabledAreas: [] }, update: {} });
    buyer = await makeUser("CONSUMER", { address: "12 Test Road" });
    farmerA = (await makeUser("FARMER")).id;
    farmerB = (await makeUser("FARMER")).id;
  });

  const due = (listingId: string | null, qty = 2) =>
    db.subscription.create({
      data: { buyerId: buyer.id, listingId, crop: "tomato", qty, unit: "kg", frequency: "DAILY", preferredSlot: "7–9 AM", nextRunAt: new Date(Date.now() - 60_000) },
    });

  it("places exactly one order when two runners race on the same subscription", async () => {
    const listing = await makeListing(farmerA, 20);
    const sub = await due(listing.id);
    const [a, b] = await Promise.all([runSubscription(sub), runSubscription(sub)]);
    expect([a.status, b.status].sort()).toEqual(["placed", "taken"]);
    const orders = await db.order.findMany({ where: { subscriptionId: sub.id } });
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("CONFIRMED");
    const after = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("falls back when the saved listing sold out, preferring the same farmer over a cheaper one", async () => {
    const farmerC = (await makeUser("FARMER")).id;
    const gone = await makeListing(farmerC, 1);
    const sameFarm = await makeListing(farmerC, 10, 35);
    await makeListing(farmerB, 30, 28);
    const sub = await due(gone.id, 3);
    const res = await runSubscription(sub);
    expect(res.status).toBe("placed");
    const order = await db.order.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    expect(order.farmerId).toBe(farmerC);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).listingId).toBe(sameFarm.id);
  });

  it("falls back to another farmer when the saved farmer has nothing left", async () => {
    const farmerD = (await makeUser("FARMER")).id;
    const gone = await makeListing(farmerD, 1);
    const sub = await due(gone.id, 3);
    const res = await runSubscription(sub);
    expect(res.status).toBe("placed");
    const order = await db.order.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    expect(order.farmerId).not.toBe(farmerD);
  });

  it("skips and moves on when nothing can cover the quantity", async () => {
    const sub = await due(null, 9_999);
    const res = await runSubscription(sub);
    expect(res.status).toBe("skipped");
    expect(await db.order.count({ where: { subscriptionId: sub.id } })).toBe(0);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("runDue ignores paused and future subscriptions", async () => {
    const listing = await makeListing(farmerA, 10);
    const paused = await db.subscription.create({
      data: { buyerId: buyer.id, listingId: listing.id, crop: "tomato", qty: 1, unit: "kg", frequency: "DAILY", preferredSlot: "7–9 AM", nextRunAt: new Date(Date.now() - 60_000), active: false },
    });
    const future = await db.subscription.create({
      data: { buyerId: buyer.id, listingId: listing.id, crop: "tomato", qty: 1, unit: "kg", frequency: "DAILY", preferredSlot: "7–9 AM", nextRunAt: new Date(Date.now() + 3_600_000) },
    });
    const summary = await runDueSubscriptions();
    const touched = summary.results.map((r) => r.subscriptionId);
    expect(touched).not.toContain(paused.id);
    expect(touched).not.toContain(future.id);
  });
});
