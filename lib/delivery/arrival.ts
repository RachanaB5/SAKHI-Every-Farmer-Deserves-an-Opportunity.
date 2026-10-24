// Arrivals at the farm: the rider taps "I've reached the farm"; a
// self-pickup buyer taps "On my way" and "I'm at the farm". Each is saved
// on the delivery and told to the farmer (their bell, and Sakhi reads it
// aloud when it runs their orders), so nobody waits at the gate unseen.
import "server-only";
import type { User } from "@prisma/client";
import { coordsFor } from "@/lib/areas";
import type { AgentItem } from "@/lib/assistant/agent-text";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { publish } from "@/lib/events";
import { notifyUser } from "@/lib/notifications";
import { minutesBetween } from "./eta";

/** Used when a place isn't on the map, so the farmer still hears a time. */
export const FALLBACK_MINUTES = 30;

/** Where the farm is: the farmer's own pin, else their village, else their area. */
export function farmCoords(f: { lat: number | null; lng: number | null; area: string | null; farmerProfile?: { village: string } | null }) {
  return f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : (coordsFor(f.farmerProfile?.village) ?? coordsFor(f.area));
}

/** Where someone sets off from: their saved pin, else their area. */
export function homeCoords(u: { lat: number | null; lng: number | null; area: string | null }) {
  return u.lat != null && u.lng != null ? { lat: u.lat, lng: u.lng } : coordsFor(u.area);
}

/** Order lines as stored on a notification. */
export function itemsOf(items: { title: string; unit: string; qty: number; listing: { crop: string } | null }[]): AgentItem[] {
  return items.map((i) => ({ crop: i.listing?.crop ?? null, title: i.title, qty: i.qty, unit: i.unit }));
}

/** Just what `itemsOf` needs from an order's lines. */
export const itemSelect = { select: { title: true, unit: true, qty: true, listing: { select: { crop: true } } } } as const;

/** The assigned rider has reached the farm: the farmer is told to check the order code and hand over. */
export async function riderArrived(orderId: string, rider: Pick<User, "id">) {
  const d = await db.delivery.findUnique({
    where: { orderId },
    include: { worker: { select: { name: true } }, order: { select: { code: true, farmerId: true, items: itemSelect } } },
  });
  if (!d || d.workerId !== rider.id) throw new HttpError(403, "You're not the rider assigned to this order");
  if (d.status !== "ASSIGNED") throw new HttpError(409, "This parcel has already left the farm");
  // Conditional so a double tap tells the farmer once.
  const moved = await db.delivery.updateMany({ where: { id: d.id, arrivedAt: null }, data: { arrivedAt: new Date() } });
  if (moved.count !== 1) return { already: true };
  publish({ type: "delivery.updated", id: orderId, userIds: [d.order.farmerId, rider.id], roles: ["ADMIN"] });
  await notifyUser(d.order.farmerId, "RIDER_ARRIVED", { orderId, code: d.order.code, rider: d.worker?.name ?? "", items: itemsOf(d.order.items) }, "/farmer/orders");
  return { already: false };
}

/**
 * A self-pickup buyer is on the way ("coming": the farmer hears roughly how
 * many minutes away) or at the farm ("here": the farmer is asked for their code).
 */
export async function buyerArrival(orderId: string, buyer: Pick<User, "id" | "lat" | "lng" | "area">, stage: "coming" | "here") {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      delivery: true,
      items: itemSelect,
      buyer: { select: { name: true, orgName: true } },
      farmer: { select: { lat: true, lng: true, area: true, farmerProfile: { select: { village: true } } } },
    },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.buyerId !== buyer.id) throw new HttpError(403, "Only the person collecting this order can do this");
  if (order.fulfilment !== "PICKUP" || order.status !== "READY_FOR_PICKUP" || !order.delivery) throw new HttpError(409, "This order isn't ready for pickup yet");
  const base = { orderId, code: order.code, buyer: order.buyer.orgName ?? order.buyer.name };

  if (stage === "coming") {
    const etaMin = minutesBetween(homeCoords(buyer), farmCoords(order.farmer)) ?? FALLBACK_MINUTES;
    await db.delivery.update({ where: { id: order.delivery.id }, data: { farmEta: new Date(Date.now() + etaMin * 60_000) } });
    publish({ type: "delivery.updated", id: orderId, userIds: [order.farmerId, buyer.id] });
    await notifyUser(order.farmerId, "BUYER_COMING", { ...base, etaMin }, "/farmer/orders");
    return { already: false, etaMin };
  }
  const moved = await db.delivery.updateMany({ where: { id: order.delivery.id, arrivedAt: null }, data: { arrivedAt: new Date() } });
  if (moved.count !== 1) return { already: true, etaMin: null };
  publish({ type: "delivery.updated", id: orderId, userIds: [order.farmerId, buyer.id] });
  await notifyUser(order.farmerId, "BUYER_ARRIVED", { ...base, items: itemsOf(order.items) }, `/farmer/pickup?code=${order.code}`);
  return { already: false, etaMin: null };
}
