// Sakhi's order autopilot: books a rider (or readies a self-pickup) as soon
// as an order is confirmed and tells the farmer when they'll arrive; keeps
// trying when no rider is free; announces arrivals at the farm; lets the
// farmer hand the parcel to the rider; and leaves farmers who haven't
// turned it on alone. The buyer's OTP still completes every handover.
import type { User } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderNotificationText, slotText } from "@/lib/assistant/agent-text";
import { agentFeed, catchUp, onDelivered, onOrderConfirmed } from "@/lib/assistant/autopilot";
import { db } from "@/lib/db";
import { buyerArrival, riderArrived } from "@/lib/delivery/arrival";
import { travelMinutes } from "@/lib/delivery/eta";
import { farmerHandedToRider, verifyHandover } from "@/lib/delivery/handover";
import { confirmOrder } from "@/lib/orders/lifecycle";
import { issueOtp } from "@/lib/otp";
import { makeListing, makeUser, placeOrder } from "./helpers";

let farmer: User;
let manualFarmer: User;
let buyer: User;
let otherBuyer: User;
let rider: User;
let otherRider: User;

async function makeFarmer(autopilot: boolean) {
  const u = await makeUser("FARMER");
  await db.farmerProfile.create({ data: { userId: u.id, farmName: "Test farm", village: "Rajanukunte", crops: [], assistantAutopilot: autopilot } });
  return u;
}

beforeAll(async () => {
  // Riders from other suites are parked so this file's bookings are predictable.
  await db.user.updateMany({ where: { role: "DELIVERY" }, data: { isAvailable: false } });
  farmer = await makeFarmer(true);
  manualFarmer = await makeFarmer(false);
  buyer = await makeUser("CONSUMER", { area: "Hebbal" });
  otherBuyer = await makeUser("CONSUMER");
  rider = await makeUser("DELIVERY", { area: "Yelahanka" });
  otherRider = await makeUser("DELIVERY", { area: "Yelahanka", isAvailable: false });
});

afterAll(async () => {
  await db.user.updateMany({ where: { role: "DELIVERY" }, data: { isAvailable: true } });
});

/** A confirmed order for `owner`, passed to the autopilot the way checkout does. */
async function confirmedOrder(owner: User, fulfilment: "DELIVERY" | "PICKUP" = "DELIVERY", slot?: string) {
  const listing = await makeListing(owner.id, 20, 40);
  const order = await placeOrder(buyer.id, owner.id, [{ listingId: listing.id, qty: 5, price: 40 }]);
  if (fulfilment === "PICKUP" || slot) await db.order.update({ where: { id: order.id }, data: { fulfilment, slot } });
  await confirmOrder(order.id, buyer.id);
  await onOrderConfirmed(order.id);
  return order;
}

const notes = (userId: string, type: string, orderId?: string) =>
  db.notification.findMany({ where: { userId, type }, orderBy: { createdAt: "asc" } }).then((rows) => rows.filter((n) => !orderId || (n.data as { orderId?: string }).orderId === orderId));
const dataOf = (n: { data: unknown }) => n.data as Record<string, unknown>;

describe("travel time", () => {
  it("rounds up to 5 minutes and stays within 5–180", () => {
    expect(travelMinutes(0)).toBe(5);
    // 10 km × 1.3 road factor at 30 km/h = 26 min + 5 to set off → 35
    expect(travelMinutes(10)).toBe(35);
    expect(travelMinutes(1000)).toBe(180);
  });
});

describe("order autopilot", () => {
  it("leaves farmers who haven't turned it on alone", async () => {
    const order = await confirmedOrder(manualFarmer);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { delivery: true } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.delivery).toBeNull();
    expect(await notes(manualFarmer.id, "ORDER_NEW")).toHaveLength(0);
  });

  it("books a rider as soon as a delivery order is confirmed, and says when they'll arrive", async () => {
    const order = await confirmedOrder(farmer);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { delivery: true } });
    expect(after.status).toBe("PACKED");
    expect(after.delivery).toMatchObject({ status: "ASSIGNED", workerId: rider.id });
    expect(after.delivery!.farmEta!.getTime()).toBeGreaterThan(Date.now());

    const [note] = await notes(farmer.id, "ORDER_NEW", order.id);
    const data = dataOf(note);
    expect(data).toMatchObject({ code: order.code, rider: rider.name, fulfilment: "DELIVERY" });
    expect(Number(data.etaMin) % 5).toBe(0);
    const text = orderNotificationText("en", "ORDER_NEW", data);
    expect(text).toContain(`rider ${rider.name}`);
    expect(text).toContain("5 kg Tomato");
    expect(text).toContain(`about ${data.etaMin} minutes`);
  });

  it("readies a self-pickup and tells the farmer the buyer's pickup window", async () => {
    const order = await confirmedOrder(farmer, "PICKUP", "Today 5–7 PM");
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { delivery: true } });
    expect(after.status).toBe("READY_FOR_PICKUP");
    expect(after.delivery?.mode).toBe("PICKUP");
    const [note] = await notes(farmer.id, "ORDER_NEW", order.id);
    expect(orderNotificationText("en", "ORDER_NEW", dataOf(note))).toContain("collect it, today 5–7 PM");
    expect(slotText("kn", "Today 5–7 PM")).toBe("ಇಂದು ಸಂಜೆ 5–7ರ ನಡುವೆ");
    expect(slotText("hi", "Tomorrow 7–9 AM")).toBe("कल सुबह 7–9 के बीच");
  });

  it("keeps trying when no rider is free, then says who is coming — once", async () => {
    await db.user.update({ where: { id: rider.id }, data: { isAvailable: false } });
    const order = await confirmedOrder(farmer);
    const [first] = await notes(farmer.id, "ORDER_NEW", order.id);
    expect(dataOf(first).rider).toBeNull();
    expect(orderNotificationText("en", "ORDER_NEW", dataOf(first))).toContain("No rider is free");

    await db.user.update({ where: { id: rider.id }, data: { isAvailable: true } });
    await catchUp(farmer.id);
    await catchUp(farmer.id);
    const booked = await notes(farmer.id, "RIDER_BOOKED", order.id);
    expect(booked).toHaveLength(1);
    expect(dataOf(booked[0])).toMatchObject({ code: order.code, rider: rider.name });
    expect((await db.delivery.findUniqueOrThrow({ where: { orderId: order.id } })).workerId).toBe(rider.id);
    expect(await notes(farmer.id, "ORDER_NEW", order.id)).toHaveLength(1);
  });

  it("takes over orders confirmed before it was turned on, and reads them out", async () => {
    const late = await makeFarmer(false);
    const order = await confirmedOrder(late);
    expect((await agentFeed(late.id)).autopilot).toBe(false);
    await db.farmerProfile.update({ where: { userId: late.id }, data: { assistantAutopilot: true } });
    const feed = await agentFeed(late.id);
    expect(feed.messages.map((m) => [m.type, m.data.orderId])).toContainEqual(["ORDER_NEW", order.id]);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PACKED");
  });

  it("tells the farmer when the rider reaches the farm; the farmer's “handed over” sends it out", async () => {
    const order = await confirmedOrder(farmer);
    await expect(riderArrived(order.id, otherRider)).rejects.toMatchObject({ status: 403 });
    expect(await riderArrived(order.id, rider)).toEqual({ already: false });
    expect(await riderArrived(order.id, rider)).toEqual({ already: true });
    const arrived = await notes(farmer.id, "RIDER_ARRIVED", order.id);
    expect(arrived).toHaveLength(1);
    expect(orderNotificationText("en", "RIDER_ARRIVED", dataOf(arrived[0]))).toContain(`phone shows ${order.code}`);
    expect((await agentFeed(farmer.id)).tasks).toContainEqual(expect.objectContaining({ kind: "handover", orderId: order.id, rider: rider.name }));

    await expect(farmerHandedToRider(order.id, manualFarmer)).rejects.toMatchObject({ status: 403 });
    expect(await farmerHandedToRider(order.id, farmer)).toMatchObject({ already: false, code: order.code, rider: rider.name });
    expect(await farmerHandedToRider(order.id, farmer)).toMatchObject({ already: true });
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { delivery: true, events: true } });
    expect(after.status).toBe("OUT_FOR_DELIVERY");
    expect(after.delivery?.status).toBe("PICKED_UP");
    expect(after.events.some((e) => e.note?.includes("confirmed by the farmer"))).toBe(true);
    expect((await agentFeed(farmer.id)).tasks.some((t) => t.orderId === order.id)).toBe(false);

    // The buyer's OTP still completes the delivery; the farmer then hears what they'll be paid.
    const { otp } = await issueOtp(after.delivery!.id);
    const done = await verifyHandover(order.id, rider, { otp });
    expect(done).toMatchObject({ ok: true, status: "DELIVERED" });
    await onDelivered(order.id, done.ok ? (done.settlementNet ?? 0) : 0);
    const [delivered] = await notes(farmer.id, "ORDER_DELIVERED", order.id);
    expect(Number(dataOf(delivered).net)).toBeGreaterThan(0);
  });

  it("tells the farmer a pickup buyer is on the way and at the farm; their code collects it", async () => {
    const order = await confirmedOrder(farmer, "PICKUP");
    await expect(buyerArrival(order.id, otherBuyer, "here")).rejects.toMatchObject({ status: 403 });
    const coming = await buyerArrival(order.id, buyer, "coming");
    expect(coming.etaMin).toBeGreaterThan(0);
    expect(await notes(farmer.id, "BUYER_COMING", order.id)).toHaveLength(1);
    expect(await buyerArrival(order.id, buyer, "here")).toMatchObject({ already: false });
    const [here] = await notes(farmer.id, "BUYER_ARRIVED", order.id);
    expect(orderNotificationText("en", "BUYER_ARRIVED", dataOf(here))).toContain("6-digit code");
    expect((await agentFeed(farmer.id)).tasks).toContainEqual(expect.objectContaining({ kind: "pickup", orderId: order.id }));

    const delivery = await db.delivery.findUniqueOrThrow({ where: { orderId: order.id } });
    const { otp } = await issueOtp(delivery.id);
    expect(await verifyHandover(order.id, farmer, { otp })).toMatchObject({ ok: true, status: "COLLECTED" });
    expect((await agentFeed(farmer.id)).tasks.some((t) => t.orderId === order.id)).toBe(false);
  });
});
