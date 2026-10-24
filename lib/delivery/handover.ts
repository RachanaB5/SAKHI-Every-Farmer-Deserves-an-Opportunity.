// Verified handover — the only way an order becomes DELIVERED/COLLECTED.
//
// Rules (enforced server-side, never trusted from the client):
//   • doorstep: caller is the signed-in rider ASSIGNED to this order, and the
//     order is OUT_FOR_DELIVERY (picked up from the farm)
//   • pickup:   caller is the farmer who owns the order (or an admin), order READY_FOR_PICKUP
//   • proof is the recipient's OTP (or, for pickup, their signed QR) — an
//     order ID or a voice command alone never completes a handover
//   • OTP: unexpired, ≤ 5 attempts (counted atomically before comparing)
//   • idempotent: a second "delivered" call is a no-op and can't create a
//     second settlement (Settlement.orderId is unique)
// On success: delivery verified, order DELIVERED/COLLECTED, reserved stock
// committed as sold, and a PENDING settlement for the farmer.
import "server-only";
import { Prisma, type User } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";
import { settlementFor } from "@/lib/fees";
import { commitItems, withTxRetry } from "@/lib/inventory";
import { notify } from "@/lib/orders/lifecycle";
import { moveOrder } from "@/lib/orders/state";
import { recomputeReliability } from "@/lib/reliability";
import { OTP_MAX_ATTEMPTS, otpMatches, readPickupToken } from "@/lib/otp";

export type HandoverResult =
  | { ok: true; already: boolean; status: "DELIVERED" | "COLLECTED"; settlementNet?: number }
  | { ok: false; reason: "no_otp" | "expired" | "locked" | "mismatch" | "bad_qr"; message: string; attemptsLeft: number };

type Proof = { otp: string } | { qrToken: string };

/**
 * Verifies the handover proof and completes the order.
 * @param actor - signed-in user (rider for doorstep, farmer for pickup)
 */
export async function verifyHandover(orderId: string, actor: Pick<User, "id" | "role">, proof: Proof): Promise<HandoverResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { delivery: true, items: true } });
  if (!order || !order.delivery) throw new HttpError(404, "No handover is set up for this order yet");
  const d = order.delivery;
  const pickup = d.mode === "PICKUP";
  const finalStatus = pickup ? "COLLECTED" : "DELIVERED";

  // Authorisation: only the assigned rider (doorstep) or the owning farmer (pickup).
  if (pickup) {
    if (actor.id !== order.farmerId && actor.role !== "ADMIN") throw new HttpError(403, "Only the farmer handing over this order can verify the pickup");
  } else if (actor.role !== "DELIVERY" || d.workerId !== actor.id) {
    throw new HttpError(403, "You're not the rider assigned to this order");
  }

  // Idempotency: already handed over → success without side effects.
  if (d.status === "DELIVERED" || order.status === "DELIVERED" || order.status === "COLLECTED") {
    return { ok: true, already: true, status: finalStatus };
  }
  const ready = pickup ? order.status === "READY_FOR_PICKUP" : order.status === "OUT_FOR_DELIVERY";
  if (!ready) throw new HttpError(409, pickup ? "This order isn't marked ready for pickup yet" : "Mark the order as picked up from the farm first");

  const method = "otp" in proof ? "OTP" : "QR";
  const fail = async (reason: Extract<HandoverResult, { ok: false }>["reason"], message: string, attemptsLeft: number): Promise<HandoverResult> => {
    await db.deliveryAttempt.create({ data: { deliveryId: d.id, actorId: actor.id, method, success: false, reason: message } });
    publish({ type: "delivery.updated", id: order.id, roles: ["ADMIN"] });
    return { ok: false, reason, message, attemptsLeft };
  };

  if (!d.otpHash || !d.otpNonce || !d.otpExpiresAt) {
    return fail("no_otp", "The recipient hasn't generated a code yet, ask them to open the order and tap “Show OTP”.", OTP_MAX_ATTEMPTS);
  }
  if (d.otpExpiresAt < new Date()) return fail("expired", "This code has expired, ask the recipient for a fresh one.", 0);

  if ("otp" in proof) {
    // Count the attempt BEFORE comparing, atomically, so parallel guesses can't exceed the limit.
    const claimed = await db.delivery.updateMany({ where: { id: d.id, otpAttempts: { lt: OTP_MAX_ATTEMPTS } }, data: { otpAttempts: { increment: 1 } } });
    if (claimed.count !== 1) return fail("locked", "Too many wrong attempts, the recipient needs to generate a new code.", 0);
    const used = d.otpAttempts + 1;
    if (!otpMatches(proof.otp.trim(), d)) {
      const left = Math.max(0, OTP_MAX_ATTEMPTS - used);
      return fail(left ? "mismatch" : "locked", left ? `That code doesn't match. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts, the recipient needs to generate a new code.", left);
    }
  } else {
    const token = await readPickupToken(proof.qrToken);
    // The QR must be for this order AND carry the current nonce (regenerating kills old QRs).
    if (!token || token.orderId !== order.id || token.nonce !== d.otpNonce) {
      return fail("bad_qr", "This QR is invalid or out of date, ask the buyer to refresh it.", OTP_MAX_ATTEMPTS - d.otpAttempts);
    }
  }

  const amounts = settlementFor({
    subtotal: order.subtotal,
    platformFee: order.platformFee,
    buyerDeliveryFee: order.deliveryFee,
    actualCourierCost: pickup ? 0 : d.cost,
  });

  const completed = await withTxRetry(async (tx) => {
    // Conditional transition: only one concurrent verifier can complete the handover.
    const moved = await tx.delivery.updateMany({
      where: { id: d.id, status: { not: "DELIVERED" } },
      data: { status: "DELIVERED", verifiedAt: new Date(), otpHash: null },
    });
    if (moved.count !== 1) return false;
    const ok = await moveOrder(tx, order.id, finalStatus, { actorId: actor.id, note: `Verified by ${method}` });
    if (!ok) throw new HttpError(409, "Order changed during handover, try again");
    await commitItems(tx, order.items);
    try {
      await tx.settlement.create({ data: { farmerId: order.farmerId, orderId: order.id, ...amounts, status: "PENDING" } });
    } catch (e) {
      // Unique orderId: a settlement already exists — never create a second payout.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
    await tx.deliveryAttempt.create({ data: { deliveryId: d.id, actorId: actor.id, method, success: true } });
    await audit({ actorId: actor.id, action: pickup ? "PICKUP_VERIFIED" : "DELIVERY_VERIFIED", entity: "Order", entityId: order.id, meta: { method, net: amounts.net } }, tx);
    return true;
  });
  if (!completed) return { ok: true, already: true, status: finalStatus };

  await recomputeReliability(order.farmerId);
  publish({ type: "settlement.updated", id: order.id, userIds: [order.farmerId], roles: ["ADMIN"] });
  publish({ type: "delivery.updated", id: order.id, userIds: [order.buyerId, order.farmerId, ...(d.workerId ? [d.workerId] : [])], roles: ["ADMIN"] });
  await notify(order.id);
  return { ok: true, already: false, status: finalStatus, settlementNet: amounts.net };
}

/** The parcel left the farm with the rider: delivery PICKED_UP, order OUT_FOR_DELIVERY. */
async function collectFromFarm(deliveryId: string, orderId: string, actorId: string, note: string) {
  await withTxRetry(async (tx) => {
    const moved = await tx.delivery.updateMany({ where: { id: deliveryId, status: "ASSIGNED" }, data: { status: "PICKED_UP", pickedUpAt: new Date() } });
    // Throwing (not returning) rolls back the delivery change if the order can't move.
    if (moved.count !== 1) throw new HttpError(409, "This run can't be marked picked up right now");
    const ok = await moveOrder(tx, orderId, "OUT_FOR_DELIVERY", { from: ["PACKED"], actorId, note });
    if (!ok) throw new HttpError(409, "The farmer hasn't packed this order yet");
  });
  await notify(orderId);
}

/**
 * Rider confirms they collected the parcel from the farm:
 * delivery PICKED_UP, order OUT_FOR_DELIVERY.
 */
export async function riderPickedUp(orderId: string, rider: Pick<User, "id">) {
  const d = await db.delivery.findUnique({ where: { orderId } });
  if (!d || d.workerId !== rider.id) throw new HttpError(403, "You're not the rider assigned to this order");
  if (d.status === "PICKED_UP") return { already: true };
  await collectFromFarm(d.id, orderId, rider.id, "Rider collected the parcel");
  return { already: false };
}

/**
 * The farmer confirms they gave the parcel to the assigned rider (Sakhi's
 * "Handed over"): the same move as the rider's "Picked up". It only moves
 * the order to out-for-delivery; the buyer's OTP still completes it.
 * @returns names for Sakhi's reply
 */
export async function farmerHandedToRider(orderId: string, farmer: Pick<User, "id">) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { code: true, farmerId: true, fulfilment: true, buyer: { select: { name: true, orgName: true } }, delivery: { select: { id: true, status: true, workerId: true, worker: { select: { name: true } } } } },
  });
  if (!order) throw new HttpError(404, "Order not found");
  if (order.farmerId !== farmer.id) throw new HttpError(403, "This order belongs to another farmer");
  const d = order.delivery;
  if (order.fulfilment !== "DELIVERY" || !d?.workerId) throw new HttpError(409, "No rider is booked for this order yet");
  const names = { code: order.code, rider: d.worker?.name ?? "", buyer: order.buyer.orgName ?? order.buyer.name };
  if (d.status === "PICKED_UP" || d.status === "DELIVERED") return { already: true, ...names };
  await collectFromFarm(d.id, orderId, farmer.id, `Handed to ${names.rider}, confirmed by the farmer`);
  await audit({ actorId: farmer.id, action: "HANDED_TO_RIDER", entity: "Order", entityId: orderId, meta: { riderId: d.workerId } });
  publish({ type: "delivery.updated", id: orderId, userIds: [d.workerId, farmer.id], roles: ["ADMIN"] });
  return { already: false, ...names };
}
