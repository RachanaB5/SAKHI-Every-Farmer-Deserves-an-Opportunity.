// Handover OTP rules: hashed storage, expiry, 5-attempt limit, assigned
// rider only, regeneration, pickup QR binding, and idempotent completion
// (never two settlements).
import type { User } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";
import { HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { verifyHandover } from "@/lib/delivery/handover";
import { confirmOrder } from "@/lib/orders/lifecycle";
import { hashOtp, issueOtp, signPickupToken } from "@/lib/otp";
import { makeListing, makeUser, placeOrder } from "./helpers";

let farmer: User;
let buyer: User;
let rider: User;
let otherRider: User;

beforeAll(async () => {
  farmer = await makeUser("FARMER");
  buyer = await makeUser("CONSUMER");
  rider = await makeUser("DELIVERY");
  otherRider = await makeUser("DELIVERY");
});

/** A confirmed order already handed to `rider` and out for delivery (or ready for pickup). */
async function outForDelivery(mode: "DELIVERY" | "PICKUP" = "DELIVERY") {
  const listing = await makeListing(farmer.id, 10, 40);
  const order = await placeOrder(buyer.id, farmer.id, [{ listingId: listing.id, qty: 2, price: 40 }]);
  await confirmOrder(order.id);
  await db.order.update({ where: { id: order.id }, data: { status: mode === "DELIVERY" ? "OUT_FOR_DELIVERY" : "READY_FOR_PICKUP", fulfilment: mode } });
  const delivery = await db.delivery.create({
    data: { orderId: order.id, mode, workerId: mode === "DELIVERY" ? rider.id : null, status: mode === "DELIVERY" ? "PICKED_UP" : "ASSIGNED", cost: mode === "DELIVERY" ? 40 : 0 },
  });
  return { order, delivery, listing };
}

describe("handover OTP", () => {
  it("stores only an HMAC of the code", async () => {
    const { delivery } = await outForDelivery();
    const { otp, nonce } = await issueOtp(delivery.id);
    const row = await db.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(otp).toMatch(/^\d{6}$/);
    expect(row.otpHash).not.toContain(otp);
    expect(row.otpHash).toBe(hashOtp(otp, delivery.id, nonce));
    expect(row.otpExpiresAt!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
  });

  it("completes the order, commits stock and creates one PENDING settlement", async () => {
    const { order, delivery, listing } = await outForDelivery();
    const { otp } = await issueOtp(delivery.id);
    const res = await verifyHandover(order.id, rider, { otp });
    expect(res).toMatchObject({ ok: true, already: false, status: "DELIVERED" });
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { settlement: true, delivery: true } });
    expect(after.status).toBe("DELIVERED");
    expect(after.delivery?.verifiedAt).not.toBeNull();
    expect(after.delivery?.otpHash).toBeNull();
    // gross 80, fee 4 (5%), courier shortfall 40 − 25 = 15 capped at 15% of 80 = 12 → net 64
    expect(after.settlement).toMatchObject({ status: "PENDING", gross: 80, platformFee: 4, deliveryCost: 12, net: 64 });
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).reservedQty).toBe(0);
  });

  it("is idempotent — a second delivered call is a no-op", async () => {
    const { order, delivery } = await outForDelivery();
    const { otp } = await issueOtp(delivery.id);
    await verifyHandover(order.id, rider, { otp });
    const again = await verifyHandover(order.id, rider, { otp });
    expect(again).toMatchObject({ ok: true, already: true });
    expect(await db.settlement.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("never creates two settlements when two verifications race", async () => {
    const { order, delivery } = await outForDelivery();
    const { otp } = await issueOtp(delivery.id);
    const results = await Promise.all([verifyHandover(order.id, rider, { otp }), verifyHandover(order.id, rider, { otp })]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await db.settlement.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("locks after 5 wrong attempts, even for the right code", async () => {
    const { order, delivery } = await outForDelivery();
    const { otp } = await issueOtp(delivery.id);
    const wrong = otp === "000000" ? "111111" : "000000";
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await verifyHandover(order.id, rider, { otp: wrong }));
    expect(results.map((r) => (r.ok ? 0 : r.attemptsLeft))).toEqual([4, 3, 2, 1, 0]);
    const locked = await verifyHandover(order.id, rider, { otp });
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    expect(await db.deliveryAttempt.count({ where: { deliveryId: delivery.id, success: false } })).toBe(6);
  });

  it("rejects expired codes", async () => {
    const { order, delivery } = await outForDelivery();
    const { otp } = await issueOtp(delivery.id);
    await db.delivery.update({ where: { id: delivery.id }, data: { otpExpiresAt: new Date(Date.now() - 1000) } });
    expect(await verifyHandover(order.id, rider, { otp })).toMatchObject({ ok: false, reason: "expired" });
  });

  it("only lets the assigned rider verify", async () => {
    const { order, delivery } = await outForDelivery();
    const { otp } = await issueOtp(delivery.id);
    await expect(verifyHandover(order.id, otherRider, { otp })).rejects.toBeInstanceOf(HttpError);
    await expect(verifyHandover(order.id, buyer, { otp })).rejects.toThrow(/not the rider/);
  });

  it("refuses before the rider has picked the order up", async () => {
    const { order, delivery } = await outForDelivery();
    await db.order.update({ where: { id: order.id }, data: { status: "PACKED" } });
    const { otp } = await issueOtp(delivery.id);
    await expect(verifyHandover(order.id, rider, { otp })).rejects.toThrow(/picked up/);
  });

  it("invalidates the old code when the recipient regenerates", async () => {
    const { order, delivery } = await outForDelivery();
    const first = await issueOtp(delivery.id);
    const second = await issueOtp(delivery.id);
    if (first.otp !== second.otp) {
      expect(await verifyHandover(order.id, rider, { otp: first.otp })).toMatchObject({ ok: false, reason: "mismatch" });
    }
    expect(await verifyHandover(order.id, rider, { otp: second.otp })).toMatchObject({ ok: true });
  });
});

describe("pickup QR", () => {
  it("lets the farmer verify a current QR and marks the order COLLECTED", async () => {
    const { order, delivery } = await outForDelivery("PICKUP");
    const { expiresAt, nonce } = await issueOtp(delivery.id);
    const token = await signPickupToken(order.id, nonce, expiresAt);
    const res = await verifyHandover(order.id, farmer, { qrToken: token });
    expect(res).toMatchObject({ ok: true, status: "COLLECTED" });
    const s = await db.settlement.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(s.deliveryCost).toBe(0);
  });

  it("rejects tampered and stale QR codes", async () => {
    const { order, delivery } = await outForDelivery("PICKUP");
    const old = await issueOtp(delivery.id);
    const staleToken = await signPickupToken(order.id, old.nonce, old.expiresAt);
    await issueOtp(delivery.id); // regenerate → new nonce
    expect(await verifyHandover(order.id, farmer, { qrToken: staleToken })).toMatchObject({ ok: false, reason: "bad_qr" });
    expect(await verifyHandover(order.id, farmer, { qrToken: `${staleToken}x` })).toMatchObject({ ok: false, reason: "bad_qr" });
  });

  it("does not let another farmer verify the pickup", async () => {
    const { order, delivery } = await outForDelivery("PICKUP");
    const { otp } = await issueOtp(delivery.id);
    const stranger = await makeUser("FARMER");
    await expect(verifyHandover(order.id, stranger, { otp })).rejects.toThrow(/Only the farmer/);
  });
});
