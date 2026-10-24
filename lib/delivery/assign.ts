// Fulfilment actions a farmer triggers from the orders board: pack, book a
// rider (one click — packs first if needed), or mark ready for pickup.
// Rider choice: available riders in the order's area first, then the one
// with the fewest active runs.
import "server-only";
import { coordsFor, haversineKm } from "@/lib/areas";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { courierCost, round2 } from "@/lib/fees";
import { withTxRetry } from "@/lib/inventory";
import { notify } from "@/lib/orders/lifecycle";
import { moveOrder } from "@/lib/orders/state";

async function loadOwned(orderId: string, farmerId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { farmer: { select: { lat: true, lng: true, area: true } }, delivery: true },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.farmerId !== farmerId) throw new HttpError(403, "This order belongs to another farmer");
  return order;
}

/** CONFIRMED → PACKED. */
export async function markPacked(orderId: string, farmerId: string) {
  await loadOwned(orderId, farmerId);
  const moved = await withTxRetry((tx) => moveOrder(tx, orderId, "PACKED", { from: ["CONFIRMED"], actorId: farmerId, note: "Packed by farmer" }));
  if (!moved) throw new HttpError(409, "Only confirmed orders can be marked packed");
  await notify(orderId);
}

/**
 * Assigns a rider to a delivery order (packing it first if needed) and
 * prices the run. Idempotent: re-booking an already-assigned order keeps
 * the existing rider.
 * @returns the assigned rider
 */
export async function bookDelivery(orderId: string, farmerId: string) {
  const order = await loadOwned(orderId, farmerId);
  if (order.fulfilment !== "DELIVERY") throw new HttpError(400, "This is a self-pickup order, mark it ready for pickup instead");
  if (order.delivery?.workerId && order.delivery.status !== "FAILED") {
    const w = await db.user.findUnique({ where: { id: order.delivery.workerId }, select: { id: true, name: true } });
    return { worker: w, alreadyBooked: true };
  }
  if (order.status === "CONFIRMED") await markPacked(orderId, farmerId);
  else if (order.status !== "PACKED") throw new HttpError(409, "Book a rider once the order is confirmed and packed");

  const riders = await db.user.findMany({
    where: { role: "DELIVERY", isAvailable: true, suspended: false },
    select: { id: true, name: true, area: true, _count: { select: { deliveries: { where: { status: { in: ["ASSIGNED", "PICKED_UP"] } } } } } },
  });
  if (!riders.length) throw new HttpError(409, "No riders are free right now, try again in a few minutes");
  riders.sort((a, b) => Number(a.area !== order.area) - Number(b.area !== order.area) || a._count.deliveries - b._count.deliveries);
  const rider = riders[0];

  const from = order.farmer.lat && order.farmer.lng ? { lat: order.farmer.lat, lng: order.farmer.lng } : coordsFor(order.farmer.area);
  const to = order.lat && order.lng ? { lat: order.lat, lng: order.lng } : coordsFor(order.area);
  const distanceKm = from && to ? round2(haversineKm(from, to)) : 10;
  const data = { mode: "DELIVERY" as const, workerId: rider.id, status: "ASSIGNED" as const, assignedAt: new Date(), distanceKm, cost: courierCost(distanceKm), failureReason: null };
  await db.delivery.upsert({ where: { orderId }, create: { orderId, ...data }, update: data });
  await audit({ actorId: farmerId, action: "DELIVERY_BOOKED", entity: "Order", entityId: orderId, meta: { riderId: rider.id, distanceKm } });
  publish({ type: "delivery.updated", id: orderId, userIds: [rider.id, order.buyerId, farmerId], roles: ["ADMIN"] });
  await notify(orderId);
  return { worker: { id: rider.id, name: rider.name }, alreadyBooked: false };
}

/** PACKED (or CONFIRMED) → READY_FOR_PICKUP; prepares the handover record. */
export async function markReadyForPickup(orderId: string, farmerId: string) {
  const order = await loadOwned(orderId, farmerId);
  if (order.fulfilment !== "PICKUP") throw new HttpError(400, "This order is for delivery, book a rider instead");
  if (order.status === "CONFIRMED") await markPacked(orderId, farmerId);
  const moved = await withTxRetry(async (tx) => {
    const ok = await moveOrder(tx, orderId, "READY_FOR_PICKUP", { from: ["PACKED"], actorId: farmerId, note: "Ready at the farm pickup point" });
    if (ok) {
      await tx.delivery.upsert({
        where: { orderId },
        create: { orderId, mode: "PICKUP", status: "ASSIGNED", assignedAt: new Date(), cost: 0 },
        update: { mode: "PICKUP", status: "ASSIGNED", cost: 0 },
      });
    }
    return ok;
  });
  if (!moved) throw new HttpError(409, "Only packed orders can be marked ready for pickup");
  await notify(orderId);
}
