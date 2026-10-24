// Sakhi's order autopilot. A farmer who turns on "Let Sakhi handle my
// orders" doesn't work the orders board: each confirmed order gets a rider
// (or is marked ready for self-pickup) here, and every step reaches the
// farmer as a notification that Sakhi reads aloud by itself. It acts only
// through the services behind the board's own buttons, and the buyer's
// OTP is still the only thing that completes a handover.
import "server-only";
import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { bookDelivery, markReadyForPickup } from "@/lib/delivery/assign";
import { FALLBACK_MINUTES, farmCoords, homeCoords, itemSelect, itemsOf } from "@/lib/delivery/arrival";
import { minutesBetween } from "@/lib/delivery/eta";
import { notifyUser, serializeNotification } from "@/lib/notifications";
import { ORDER_NOTIFICATION_TYPES, type AgentItem } from "./agent-text";

/** Unread order news older than this stays in the bell but isn't read aloud. */
const ANNOUNCE_WINDOW_MS = 12 * 60 * 60 * 1000;

const orderInclude = {
  items: itemSelect,
  buyer: { select: { name: true, orgName: true } },
  farmer: { select: { lat: true, lng: true, area: true, farmerProfile: { select: { village: true, assistantAutopilot: true } } } },
  delivery: { select: { workerId: true, status: true } },
} satisfies Prisma.OrderInclude;
type AutopilotOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Something only the farmer can do: hand the parcel to the rider, or check the buyer's code. */
export type AgentTask =
  | { kind: "handover"; orderId: string; code: string; buyer: string; rider: string; items: AgentItem[] }
  | { kind: "pickup"; orderId: string; code: string; buyer: string; items: AgentItem[] };

/** Whether Sakhi runs this farmer's orders. */
export async function autopilotOn(farmerId: string): Promise<boolean> {
  const p = await db.farmerProfile.findUnique({ where: { userId: farmerId }, select: { assistantAutopilot: true } });
  return p?.assistantAutopilot ?? false;
}

/**
 * Books the best free rider for a delivery order (packing it, like the
 * board's one-click button) and works out when they'll reach the farm.
 * @returns the rider and minutes away, or null when nobody could be booked
 */
async function bookRider(order: AutopilotOrder) {
  try {
    const { worker, alreadyBooked } = await bookDelivery(order.id, order.farmerId);
    if (!worker) return null;
    const rider = await db.user.findUnique({ where: { id: worker.id }, select: { lat: true, lng: true, area: true } });
    const etaMin = minutesBetween(rider && homeCoords(rider), farmCoords(order.farmer)) ?? FALLBACK_MINUTES;
    if (!alreadyBooked) await db.delivery.update({ where: { orderId: order.id }, data: { farmEta: new Date(Date.now() + etaMin * 60_000) } });
    return { rider: worker.name, etaMin };
  } catch (e) {
    // No rider free (or the order moved on meanwhile): try again on the next catch-up.
    if (e instanceof HttpError && e.status === 409) return null;
    throw e;
  }
}

/** Books a rider or readies a self-pickup, then tells the farmer about the order. */
async function takeOver(order: AutopilotOrder) {
  const base = { orderId: order.id, code: order.code, buyer: order.buyer.orgName ?? order.buyer.name, items: itemsOf(order.items), fulfilment: order.fulfilment };
  if (order.fulfilment === "PICKUP") {
    await markReadyForPickup(order.id, order.farmerId);
    await notifyUser(order.farmerId, "ORDER_NEW", { ...base, slot: order.slot }, "/farmer/orders");
    return;
  }
  const booked = await bookRider(order);
  await notifyUser(order.farmerId, "ORDER_NEW", { ...base, rider: booked?.rider ?? null, etaMin: booked?.etaMin ?? null }, "/farmer/orders");
}

/**
 * Runs right after an order is confirmed (stock reserved, payment taken).
 * Never throws: a buyer's checkout must not fail because of the autopilot.
 */
export async function onOrderConfirmed(orderId: string) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order || order.status !== "CONFIRMED" || !order.farmer.farmerProfile?.assistantAutopilot) return;
    await takeOver(order);
  } catch (e) {
    console.error("[autopilot]", e);
  }
}

/** Tells an autopilot farmer that a doorstep delivery was verified and what they'll be paid. */
export async function onDelivered(orderId: string, net: number) {
  try {
    const o = await db.order.findUnique({
      where: { id: orderId },
      select: { code: true, farmerId: true, buyer: { select: { name: true, orgName: true } }, farmer: { select: { farmerProfile: { select: { assistantAutopilot: true } } } } },
    });
    if (!o?.farmer.farmerProfile?.assistantAutopilot) return;
    await notifyUser(o.farmerId, "ORDER_DELIVERED", { orderId, code: o.code, buyer: o.buyer.orgName ?? o.buyer.name, net }, "/farmer/payments");
  } catch (e) {
    console.error("[autopilot]", e);
  }
}

/** Farmers whose catch-up is running in this server process (two open tabs poll at once). */
const catchingUp = new Set<string>();

/**
 * Catches up on the farmer's waiting orders: orders confirmed before the
 * autopilot was on are taken over, and riders that weren't free before are
 * booked now (the farmer hears "rider booked").
 */
export async function catchUp(farmerId: string) {
  if (catchingUp.has(farmerId)) return;
  catchingUp.add(farmerId);
  try {
    const waiting = await db.order.findMany({
      where: { farmerId, OR: [{ status: "CONFIRMED" }, { status: "PACKED", fulfilment: "DELIVERY" }] },
      include: orderInclude,
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    const riderless = waiting.filter((o) => o.fulfilment === "PICKUP" || !o.delivery?.workerId || o.delivery.status === "FAILED");
    if (!riderless.length) return;
    const told = await db.notification.findMany({ where: { userId: farmerId, type: "ORDER_NEW" }, orderBy: { createdAt: "desc" }, take: 100, select: { data: true } });
    const announced = new Set(told.map((n) => (n.data as { orderId?: string } | null)?.orderId));
    for (const order of riderless) {
      // One order that can't move (changed meanwhile) mustn't stop the others.
      try {
        if (!announced.has(order.id)) {
          await takeOver(order);
          continue;
        }
        const booked = order.fulfilment === "DELIVERY" ? await bookRider(order) : null;
        if (booked) await notifyUser(farmerId, "RIDER_BOOKED", { orderId: order.id, code: order.code, ...booked }, "/farmer/orders");
      } catch (e) {
        console.error("[autopilot]", order.code, e);
      }
    }
  } finally {
    catchingUp.delete(farmerId);
  }
}

/**
 * What Sakhi should say now (unread order news, oldest first) and what is
 * waiting on the farmer (someone at the farm). Catches up first.
 */
export async function agentFeed(farmerId: string) {
  if (!(await autopilotOn(farmerId))) return { autopilot: false, messages: [], tasks: [] as AgentTask[] };
  await catchUp(farmerId);
  const [rows, atFarm] = await Promise.all([
    db.notification.findMany({
      where: { userId: farmerId, readAt: null, type: { in: [...ORDER_NOTIFICATION_TYPES] }, createdAt: { gte: new Date(Date.now() - ANNOUNCE_WINDOW_MS) } },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    db.order.findMany({
      where: { farmerId, status: { in: ["PACKED", "READY_FOR_PICKUP"] }, delivery: { is: { status: "ASSIGNED", arrivedAt: { not: null } } } },
      include: { items: itemSelect, buyer: { select: { name: true, orgName: true } }, delivery: { select: { arrivedAt: true, worker: { select: { name: true } } } } },
      orderBy: { updatedAt: "asc" },
    }),
  ]);
  const tasks = atFarm.map((o): AgentTask => {
    const base = { orderId: o.id, code: o.code, buyer: o.buyer.orgName ?? o.buyer.name, items: itemsOf(o.items) };
    return o.fulfilment === "PICKUP" ? { kind: "pickup", ...base } : { kind: "handover", ...base, rider: o.delivery?.worker?.name ?? "" };
  });
  return { autopilot: true, messages: rows.map(serializeNotification), tasks };
}

export type AgentFeed = Awaited<ReturnType<typeof agentFeed>>;
