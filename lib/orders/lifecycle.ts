// Order lifecycle: create (PLACED, payment AUTHORISED) → confirm (stock
// reserved + payment CAPTURED, atomically) → cancel (stock released,
// payment refunded/voided). Payment states are simulated but kept
// honest: a placed order is never shown as money received by a farmer.
import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type Fulfilment, type OrderType } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { publish } from "@/lib/events";
import { InsufficientStockError, releaseItems, reserveItems, withTxRetry } from "@/lib/inventory";
import { newOrderCode } from "@/lib/orders/code";
import { HOLDS_STOCK, moveOrder } from "@/lib/orders/state";

export interface NewOrder {
  buyerId: string;
  farmerId: string;
  type: OrderType;
  fulfilment: Fulfilment;
  area: string;
  addressLine?: string | null;
  slot?: string | null;
  lat?: number | null;
  lng?: number | null;
  groupId?: string | null;
  offerId?: string | null;
  subscriptionId?: string | null;
  notes?: string | null;
  paymentMethod?: string;
  items: { listingId: string; title: string; unit: string; qty: number; unitPrice: number }[];
  totals: { subtotal: number; deliveryFee: number; platformFee: number; total: number };
}

/** Simulated gateway reference. */
export function paymentRef(): string {
  return `SIM-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * Creates a PLACED order with an AUTHORISED (held, not captured) payment.
 * Does not touch stock. Retries on the rare order-code collision.
 */
export async function createPlacedOrder(o: NewOrder) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.order.create({
        data: {
          code: newOrderCode(),
          buyerId: o.buyerId,
          farmerId: o.farmerId,
          type: o.type,
          status: "PLACED",
          fulfilment: o.fulfilment,
          area: o.area,
          addressLine: o.addressLine ?? null,
          slot: o.slot ?? null,
          lat: o.lat ?? null,
          lng: o.lng ?? null,
          groupId: o.groupId ?? null,
          offerId: o.offerId ?? null,
          subscriptionId: o.subscriptionId ?? null,
          notes: o.notes ?? null,
          ...o.totals,
          items: { create: o.items.map((i) => ({ ...i, farmerId: o.farmerId })) },
          events: { create: { status: "PLACED", actorId: o.buyerId } },
          payment: { create: { status: "AUTHORISED", amount: o.totals.total, method: o.paymentMethod ?? "UPI (simulated)", ref: paymentRef() } },
        },
        include: { items: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new HttpError(500, "Could not create the order, please try again");
}

export type ConfirmResult = { ok: true } | { ok: false; reason: string; listingId: string };

/**
 * Confirms a PLACED order: reserves every item's stock and captures the
 * payment in ONE transaction. If any item can't be reserved, nothing is
 * reserved, the order is CANCELLED and the payment authorisation released.
 * Idempotent — confirming an already-confirmed order is a no-op.
 */
export async function confirmOrder(orderId: string, actorId?: string | null): Promise<ConfirmResult> {
  try {
    await withTxRetry(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new HttpError(404, "Order not found");
      if (order.status !== "PLACED") return;
      await reserveItems(tx, order.items.map((i) => ({ listingId: i.listingId, qty: i.qty, title: i.title })));
      const moved = await moveOrder(tx, orderId, "CONFIRMED", { from: ["PLACED"], actorId, note: "Stock reserved, payment captured" });
      if (!moved) throw new HttpError(409, "Order changed while confirming");
      await tx.payment.update({ where: { orderId }, data: { status: "CAPTURED", capturedAt: new Date() } });
    });
    await notify(orderId);
    return { ok: true };
  } catch (e) {
    if (!(e instanceof InsufficientStockError)) throw e;
    await withTxRetry(async (tx) => {
      const moved = await moveOrder(tx, orderId, "CANCELLED", { from: ["PLACED"], note: e.message, data: { cancelReason: e.message } });
      if (moved) {
        await tx.payment.update({ where: { orderId }, data: { status: "FAILED", failureReason: "Stock unavailable, authorisation released, no money taken" } });
      }
    });
    await notify(orderId);
    return { ok: false, reason: e.message, listingId: e.listingId };
  }
}

/**
 * Cancels an order before handover: releases reserved stock and refunds a
 * captured payment (or voids an authorisation).
 * @param reason - shown to buyer and farmer
 */
export async function cancelOrder(orderId: string, actorId: string | null, reason: string) {
  const done = await withTxRetry(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, payment: true } });
    if (!order) throw new HttpError(404, "Order not found");
    const heldStock = HOLDS_STOCK.includes(order.status);
    const moved = await moveOrder(tx, orderId, "CANCELLED", { actorId, note: reason, data: { cancelReason: reason } });
    if (!moved) return false;
    if (heldStock) await releaseItems(tx, order.items);
    if (order.payment) {
      const captured = order.payment.status === "CAPTURED";
      await tx.payment.update({
        where: { orderId },
        data: captured ? { status: "REFUNDED", refundedAt: new Date() } : { status: "FAILED", failureReason: "Authorisation released on cancellation" },
      });
    }
    await tx.delivery.updateMany({ where: { orderId, status: { notIn: ["DELIVERED"] } }, data: { status: "FAILED", failureReason: reason, otpHash: null } });
    return true;
  });
  if (!done) throw new HttpError(409, "This order can no longer be cancelled");
  await notify(orderId);
}

/** Pushes an order change to its buyer, farmer, rider and admins (+ stock change to all). */
export async function notify(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true, buyerId: true, farmerId: true, status: true, delivery: { select: { workerId: true } }, items: { select: { listingId: true } } } });
  if (!o) return;
  const userIds = [o.buyerId, o.farmerId, o.delivery?.workerId].filter(Boolean) as string[];
  publish({ type: "order.updated", id: o.id, userIds, roles: ["ADMIN"], data: { status: o.status } });
  for (const i of o.items) publish({ type: "inventory.updated", id: i.listingId });
}
