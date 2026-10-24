// Order reads shared by buyer tracking, farmer order management, the
// delivery app and admin monitoring — one include, one serializer, and an
// access check that knows who may see which order.
import "server-only";
import type { Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";

export const orderInclude = {
  items: { include: { listing: { select: { imageUrl: true, crop: true } } } },
  events: { orderBy: { createdAt: "asc" as const } },
  payment: true,
  settlement: true,
  feedback: true,
  delivery: { include: { worker: { select: { id: true, name: true, phone: true } } } },
  buyer: { select: { id: true, name: true, phone: true, orgName: true, area: true } },
  farmer: { select: { id: true, name: true, phone: true, lat: true, lng: true, farmerProfile: { select: { farmName: true, village: true } } } },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Masks a phone number for people who don't need the full number. */
function mask(phone: string) {
  return `+91 ${phone.slice(0, 2)}••••${phone.slice(-3)}`;
}

/**
 * Client shape for an order. Phone numbers are only unmasked for the
 * counterpart who has to call (rider ↔ buyer, farmer ↔ rider).
 */
export function serializeOrder(o: OrderRow, viewer: Pick<User, "id" | "role">) {
  const isBuyer = viewer.id === o.buyerId;
  const isFarmer = viewer.id === o.farmerId;
  const isRider = viewer.id === o.delivery?.workerId;
  const isAdmin = viewer.role === "ADMIN";
  return {
    id: o.id,
    code: o.code,
    groupId: o.groupId,
    type: o.type,
    status: o.status,
    fulfilment: o.fulfilment,
    slot: o.slot,
    area: o.area,
    addressLine: isBuyer || isRider || isAdmin || isFarmer ? o.addressLine : null,
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    platformFee: o.platformFee,
    total: o.total,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    items: o.items.map((i) => ({ id: i.id, listingId: i.listingId, title: i.title, unit: i.unit, qty: i.qty, unitPrice: i.unitPrice, imageUrl: i.listing.imageUrl, crop: i.listing.crop })),
    events: o.events.map((e) => ({ status: e.status, note: e.note, createdAt: e.createdAt.toISOString() })),
    payment: o.payment && {
      status: o.payment.status,
      amount: o.payment.amount,
      method: o.payment.method,
      ref: o.payment.ref,
      authorisedAt: o.payment.authorisedAt.toISOString(),
      capturedAt: o.payment.capturedAt?.toISOString() ?? null,
      refundedAt: o.payment.refundedAt?.toISOString() ?? null,
      failureReason: o.payment.failureReason,
    },
    settlement:
      (isFarmer || isAdmin) && o.settlement
        ? { status: o.settlement.status, gross: o.settlement.gross, platformFee: o.settlement.platformFee, deliveryCost: o.settlement.deliveryCost, net: o.settlement.net, settledAt: o.settlement.settledAt?.toISOString() ?? null }
        : null,
    feedback: o.feedback && { rating: o.feedback.rating, issue: o.feedback.issue, comment: o.feedback.comment, photoUrl: o.feedback.photoUrl },
    delivery: o.delivery && {
      id: o.delivery.id,
      mode: o.delivery.mode,
      status: o.delivery.status,
      distanceKm: o.delivery.distanceKm,
      cost: isFarmer || isAdmin ? o.delivery.cost : null,
      otpActive: Boolean(o.delivery.otpHash && o.delivery.otpExpiresAt && o.delivery.otpExpiresAt > new Date()),
      otpExpiresAt: o.delivery.otpExpiresAt?.toISOString() ?? null,
      otpAttempts: o.delivery.otpAttempts,
      verifiedAt: o.delivery.verifiedAt?.toISOString() ?? null,
      worker: o.delivery.worker && { id: o.delivery.worker.id, name: o.delivery.worker.name, phone: isBuyer || isFarmer || isAdmin || isRider ? `+91 ${o.delivery.worker.phone}` : mask(o.delivery.worker.phone) },
    },
    buyer: { id: o.buyer.id, name: o.buyer.orgName ?? o.buyer.name, phone: isRider || isFarmer || isAdmin ? `+91 ${o.buyer.phone}` : null, area: o.buyer.area },
    farmer: { id: o.farmer.id, name: o.farmer.name, farmName: o.farmer.farmerProfile?.farmName ?? null, village: o.farmer.farmerProfile?.village ?? null, phone: isRider || isBuyer || isAdmin ? `+91 ${o.farmer.phone}` : null },
  };
}

export type SerializedOrder = ReturnType<typeof serializeOrder>;

/**
 * Loads an order and checks the viewer is its buyer, farmer, assigned
 * rider or an admin.
 */
export async function loadOrderFor(user: Pick<User, "id" | "role">, id: string): Promise<OrderRow> {
  const order = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw new HttpError(404, "Order not found");
  const allowed = user.role === "ADMIN" || order.buyerId === user.id || order.farmerId === user.id || order.delivery?.workerId === user.id;
  if (!allowed) throw new HttpError(403, "This order isn't yours");
  return order;
}
